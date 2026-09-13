/**
 * hub-roster.ts — build the canonical College Data Hub roster (`data/institutes.json`).
 *
 * Source of truth for identity is the committed JoSAA corpus (`data/josaa/by-year/*.csv.gz`):
 * every IIT / NIT / IIIT that appears there gets a row keyed by the canonical `instituteId`
 * (enrich.ts), with every official spelling seen across years in `josaaNames`. Institutes
 * that students ask about but that do not counsel through JoSAA (IIIT Hyderabad / Bangalore /
 * Delhi) are appended from the EXTRA table with `inCutoffs: false`.
 *
 * Re-runnable: overwrites institutes.json but preserves any owner-filled `nirfId` / `website`
 * / `pilot` values from the previous file, keyed by id.
 *
 * Usage: pnpm --filter @sc/catalog hub:roster
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseCorpus, distinctInstitutes, contentFor, Roster, type RosterRow, type Cutoff } from '@sc/catalog-core';
import { dataDir, rosterPath } from './hub-common';

const byYearDir = join(dataDir, 'josaa/by-year');

/** Pilot batch agreed with the owner (2026-09-13). */
const PILOT = new Set(['iit-bombay', 'iit-madras', 'nit-trichy', 'nit-warangal', 'iiit-allahabad', 'iiitdm-jabalpur']);

/** Own-entrance IIITs (not in JoSAA, hence not in the cutoff corpus). Facts: name/city/state/site only. */
const EXTRA: RosterRow[] = [
  {
    id: 'iiit-hyderabad', type: 'IIIT', officialName: 'International Institute of Information Technology, Hyderabad',
    short: 'IIIT Hyderabad', city: 'Hyderabad', state: 'Telangana', website: 'https://www.iiit.ac.in',
    admissionRoute: 'own-entrance', inCutoffs: false, josaaType: null, josaaNames: [], nirfId: null, pilot: false,
  },
  {
    id: 'iiit-bangalore', type: 'IIIT', officialName: 'International Institute of Information Technology Bangalore',
    short: 'IIIT Bangalore', city: 'Bengaluru', state: 'Karnataka', website: 'https://www.iiitb.ac.in',
    admissionRoute: 'own-entrance', inCutoffs: false, josaaType: null, josaaNames: [], nirfId: null, pilot: false,
  },
  {
    id: 'iiit-delhi', type: 'IIIT', officialName: 'Indraprastha Institute of Information Technology Delhi',
    short: 'IIIT Delhi', city: 'New Delhi', state: 'Delhi', website: 'https://www.iiitd.ac.in',
    admissionRoute: 'own-entrance', inCutoffs: false, josaaType: null, josaaNames: [], nirfId: null, pilot: false,
  },
];

/** Institutes JoSAA files with the NITs even though the name carries no "NIT". */
const NIT_OVERRIDES = new Set(['iiest-shibpur']);

function loadCorpus(): Cutoff[] {
  const files = readdirSync(byYearDir)
    .filter((f) => /^josaa-\d{4}\.csv\.gz$/.test(f))
    .sort()
    .map((f) => ({ text: gunzipSync(readFileSync(join(byYearDir, f))).toString('utf8') }));
  if (files.length === 0) throw new Error(`no corpus under ${byYearDir}`);
  return parseCorpus(files);
}

function main() {
  const previous = new Map<string, RosterRow>();
  if (existsSync(rosterPath)) {
    for (const r of Roster.parse(JSON.parse(readFileSync(rosterPath, 'utf8')))) previous.set(r.id, r);
  }

  const cutoffs = loadCorpus();
  const names = new Map<string, Set<string>>();
  for (const c of cutoffs) {
    let s = names.get(c.instituteId);
    if (!s) { s = new Set(); names.set(c.instituteId, s); }
    s.add(c.institute);
  }

  const rows: RosterRow[] = [];
  for (const inst of distinctInstitutes(cutoffs)) {
    const type = NIT_OVERRIDES.has(inst.id) ? 'NIT' : inst.type;
    if (type !== 'IIT' && type !== 'NIT' && type !== 'IIIT') continue; // GFTIs are out of scope for now
    const prev = previous.get(inst.id);
    rows.push({
      id: inst.id,
      type,
      officialName: inst.institute,
      short: inst.short,
      city: inst.city,
      state: inst.state,
      website: prev?.website ?? contentFor(inst.id)?.website ?? null,
      admissionRoute: type === 'IIT' ? 'jee-adv-direct' : 'josaa',
      inCutoffs: true,
      josaaType: NIT_OVERRIDES.has(inst.id) ? 'NIT' : inst.type,
      josaaNames: [...(names.get(inst.id) ?? [])].sort(),
      nirfId: prev?.nirfId ?? null,
      pilot: prev?.pilot ?? PILOT.has(inst.id),
    });
  }
  for (const e of EXTRA) {
    const prev = previous.get(e.id);
    rows.push({ ...e, nirfId: prev?.nirfId ?? e.nirfId, pilot: prev?.pilot ?? e.pilot });
  }

  const order = { IIT: 0, NIT: 1, IIIT: 2 } as const;
  rows.sort((a, b) => order[a.type] - order[b.type] || a.short.localeCompare(b.short));

  const ids = new Set<string>();
  for (const r of rows) {
    if (ids.has(r.id)) throw new Error(`duplicate roster id: ${r.id}`);
    ids.add(r.id);
  }
  const roster = Roster.parse(rows);
  writeFileSync(rosterPath, JSON.stringify(roster, null, 2) + '\n');

  const counts = roster.reduce<Record<string, number>>((m, r) => ((m[r.type] = (m[r.type] ?? 0) + 1), m), {});
  console.log(`wrote ${rosterPath}: ${roster.length} institutes`, counts);
  const missingPilot = [...PILOT].filter((p) => !ids.has(p));
  if (missingPilot.length) console.warn('pilot ids not found in corpus:', missingPilot);
  const multi = roster.filter((r) => r.josaaNames.length > 1);
  if (multi.length) console.log('ids with >1 official spelling (name churn, correctly merged):', multi.map((r) => `${r.id}(${r.josaaNames.length})`).join(' '));
}

main();
