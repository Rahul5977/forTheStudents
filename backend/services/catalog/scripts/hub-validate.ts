/**
 * hub-validate.ts — gate for the College Data Hub dataset.
 *
 * Checks every `data/colleges/<id>/<section>.json` against the zod contract in
 * @sc/catalog-core (hub/schema.ts), plus the cross-file rules the schema cannot express:
 *   • every institute directory is a roster id (and reports roster ids with no directory)
 *   • `instituteId` inside each file equals its directory name
 *   • aggregator hosts are never cited as `official`
 *   • `asOf` years are plausible (1950 .. next year — alumni/history facts may cite old sources)
 *   • a non-null seat matrix has > 0 seats
 *   • `_meta.json`, when present, parses
 * Writes `data/colleges/coverage.json` (per institute × section, % of fact leaves filled) and
 * prints a table. Exit 1 on any error; coverage is informational.
 *
 * Usage: pnpm --filter @sc/catalog hub:validate [--json]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HUB_SECTIONS, HUB_SECTION_NAMES, HubMeta, AGGREGATOR_HOSTS, type HubSection,
} from '@sc/catalog-core';
import { loadRoster, collegeDirs, collegesDir, coveragePath, readJson, hostOf, coverageOf } from './hub-common';

interface Problem { id: string; file: string; message: string }

const THIS_YEAR = new Date().getFullYear();
const AGG = new Set<string>(AGGREGATOR_HOSTS);

/** Walk any parsed section and yield every Source object (they all live under a `sources` key). */
function* sourcesIn(v: unknown, path = ''): Generator<{ path: string; src: Record<string, unknown> }> {
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* sourcesIn(v[i], `${path}[${i}]`); return; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'sources' && Array.isArray(x)) {
        for (let i = 0; i < x.length; i++) yield { path: `${path}.sources[${i}]`, src: x[i] as Record<string, unknown> };
      } else yield* sourcesIn(x, path ? `${path}.${k}` : k);
    }
  }
}

function* asOfIn(v: unknown, path = ''): Generator<{ path: string; asOf: string }> {
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* asOfIn(v[i], `${path}[${i}]`); return; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'asOf' && typeof x === 'string') yield { path: `${path}.asOf`, asOf: x };
      else yield* asOfIn(x, path ? `${path}.${k}` : k);
    }
  }
}

function checkSection(id: string, section: HubSection, value: unknown, problems: Problem[]): unknown {
  const file = `${id}/${section}.json`;
  const parsed = HUB_SECTIONS[section].safeParse(value);
  if (!parsed.success) {
    for (const iss of parsed.error.issues.slice(0, 25)) problems.push({ id, file, message: `${iss.path.join('.') || '<root>'}: ${iss.message}` });
    if (parsed.error.issues.length > 25) problems.push({ id, file, message: `…and ${parsed.error.issues.length - 25} more schema issues` });
    return undefined;
  }
  const data = parsed.data as unknown;
  if (data && typeof data === 'object' && (data as { instituteId?: string }).instituteId !== id) {
    problems.push({ id, file, message: `instituteId "${(data as { instituteId?: string }).instituteId}" ≠ directory "${id}"` });
  }
  for (const { path, src } of sourcesIn(data)) {
    const host = hostOf(String(src.url));
    const isAgg = [...AGG].some((h) => host === h || host.endsWith(`.${h}`));
    if (isAgg && src.confidence === 'official') problems.push({ id, file, message: `${path}: ${host} cannot be cited as "official" (aggregator → use "secondary")` });
  }
  for (const { path, asOf } of asOfIn(data)) {
    const m = /((?:19|20)\d{2})/.exec(asOf);
    if (m) {
      const y = Number(m[1]);
      if (y < 1950 || y > THIS_YEAR + 1) problems.push({ id, file, message: `${path}: implausible asOf year ${y}` });
    }
  }
  if (section === 'seat-matrix' && data) {
    const rows = (data as { rows: { seats: number }[] }).rows;
    const total = rows.reduce((s, r) => s + r.seats, 0);
    if (total <= 0) problems.push({ id, file, message: `seat matrix has ${rows.length} rows but 0 seats` });
  }
  return data;
}

function main() {
  const json = process.argv.includes('--json');
  const roster = loadRoster();
  const rosterIds = new Set(roster.map((r) => r.id));
  const problems: Problem[] = [];
  const coverage: Record<string, Record<string, number>> = {};

  const dirs = collegeDirs();
  for (const id of dirs) {
    if (!rosterIds.has(id)) { problems.push({ id, file: id, message: 'directory is not a roster id (typo? run hub:roster?)' }); continue; }
    coverage[id] = {};
    for (const section of HUB_SECTION_NAMES) {
      const p = join(collegesDir, id, `${section}.json`);
      if (!existsSync(p)) { coverage[id][section] = -1; continue; } // not collected yet
      const r = readJson(p);
      if (!r.ok) { problems.push({ id, file: `${id}/${section}.json`, message: `invalid JSON: ${r.error}` }); coverage[id][section] = 0; continue; }
      const data = checkSection(id, section, r.value, problems);
      coverage[id][section] = data === undefined ? 0 : coverageOf(data);
    }
    const metaPath = join(collegesDir, id, '_meta.json');
    if (existsSync(metaPath)) {
      const r = readJson(metaPath);
      const m = r.ok ? HubMeta.safeParse(r.value) : null;
      if (!r.ok || !m?.success) problems.push({ id, file: `${id}/_meta.json`, message: r.ok ? m!.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : r.error });
      else if (m.data.instituteId !== id) problems.push({ id, file: `${id}/_meta.json`, message: 'instituteId ≠ directory' });
    }
  }

  const notCollected = roster.filter((r) => !dirs.includes(r.id)).map((r) => r.id);

  // Coverage report
  const out = { generatedAt: new Date().toISOString(), sections: HUB_SECTION_NAMES, institutes: coverage, notCollected };
  if (existsSync(collegesDir)) writeFileSync(coveragePath, JSON.stringify(out, null, 2) + '\n');

  if (json) {
    console.log(JSON.stringify({ problems, coverage: out }, null, 2));
  } else {
    if (dirs.length) {
      const head = ['institute'.padEnd(24), ...HUB_SECTION_NAMES.map((s) => s.slice(0, 8).padStart(9))].join('');
      console.log(head);
      for (const id of Object.keys(coverage)) {
        const cells = HUB_SECTION_NAMES.map((s) => { const v = coverage[id]![s]; return (v === -1 ? '—' : v === undefined ? '?' : `${v}%`).padStart(9); });
        console.log(id.padEnd(24) + cells.join(''));
      }
    }
    console.log(`\n${dirs.length} institute dir(s) checked · ${notCollected.length} roster institute(s) not yet collected`);
    if (problems.length) {
      console.error(`\n✗ ${problems.length} problem(s):`);
      for (const p of problems) console.error(`  ${p.file}: ${p.message}`);
    } else {
      console.log('✓ no problems');
    }
  }
  process.exit(problems.length ? 1 : 0);
}

main();
