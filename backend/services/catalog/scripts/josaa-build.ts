/**
 * josaa-build.ts — turn the per-partition ORCR scrapes into the committed data artifacts.
 *
 * `josaa-orcr.ts` writes one CSV per (year, round, instituteType) — 140 small files, which is the
 * right shape for a resumable scraper but the wrong shape for git and for seeding. This script
 * folds them into per-year gzipped artifacts plus a single integrity manifest, and verifies every
 * partition against the sha256 the scraper recorded at fetch time.
 *
 * Usage:
 *   tsx scripts/josaa-build.ts            # verify + build
 *   tsx scripts/josaa-build.ts --verify   # integrity + coverage only, write nothing
 *
 * Emits:
 *   data/josaa/by-year/josaa-<year>.csv.gz   all rounds, all types, one file per year
 *   data/josaa/final-round/josaa-<year>-r<n>.csv   final round only (existing history schema)
 *   data/josaa/manifest.json                  merged provenance + integrity for every partition
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TYPES, CSV_HEADER, type TypeKey } from './josaa-orcr';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data/josaa');
const csvDir = join(dataDir, 'csv');
const byYearDir = join(dataDir, 'by-year');
const finalDir = join(dataDir, 'final-round');
const TYPE_KEYS = Object.keys(TYPES) as TypeKey[];

interface Entry {
  file: string; year: number; round: string; type: TypeKey;
  rows: number; institutes: number; programs: number;
  sha256: string; bytes: number; fetchedAt: string; source: string;
}

/** Merge the four per-type manifests the scraper agents wrote independently. */
function loadEntries(): Entry[] {
  const out: Entry[] = [];
  for (const type of TYPE_KEYS) {
    const p = join(dataDir, `manifest-${type}.json`);
    if (!existsSync(p)) { console.warn(`! no manifest-${type}.json — ${type} not acquired yet`); continue; }
    out.push(...Object.values(JSON.parse(readFileSync(p, 'utf8')) as Record<string, Entry>));
  }
  return out.sort((a, b) => a.year - b.year || a.round.localeCompare(b.round) || a.type.localeCompare(b.type));
}

const dataLines = (csv: string) => csv.split('\n').slice(1).filter((l) => l.trim());

/** Every partition must exist on disk AND still hash to what the scraper recorded. */
function verify(entries: Entry[]) {
  let bad = 0;
  for (const e of entries) {
    const p = join(csvDir, e.file);
    if (!existsSync(p)) { console.error(`  ✗ MISSING ${e.file}`); bad++; continue; }
    const csv = readFileSync(p, 'utf8');
    const sha = createHash('sha256').update(csv).digest('hex');
    if (sha !== e.sha256) { console.error(`  ✗ CHECKSUM ${e.file}`); bad++; continue; }
    const n = dataLines(csv).length;
    if (n !== e.rows) { console.error(`  ✗ ROWCOUNT ${e.file}: disk ${n} vs manifest ${e.rows}`); bad++; }
  }
  // Orphans: a CSV on disk that no manifest claims means an interrupted or hand-edited run.
  const claimed = new Set(entries.map((e) => e.file));
  for (const f of existsSync(csvDir) ? readdirSync(csvDir).filter((f) => f.endsWith('.csv')) : []) {
    if (!claimed.has(f)) { console.error(`  ✗ ORPHAN ${f} (on disk, not in any manifest)`); bad++; }
  }
  return bad;
}

/** year × round × type coverage grid — the fastest way to spot a hole. */
function coverage(entries: Entry[]) {
  const years = [...new Set(entries.map((e) => e.year))].sort();
  const have = new Set(entries.map((e) => `${e.year}|${e.round}|${e.type}`));
  const rounds = new Map<number, string[]>();
  for (const e of entries) {
    const r = rounds.get(e.year) ?? [];
    if (!r.includes(e.round)) r.push(e.round);
    rounds.set(e.year, r.sort());
  }
  console.log(`\n  ${'year/rd'.padEnd(9)}${TYPE_KEYS.map((t) => t.padStart(7)).join('')}${'rows'.padStart(10)}`);
  let holes = 0;
  for (const y of years) {
    for (const rd of rounds.get(y) ?? []) {
      const cells = TYPE_KEYS.map((t) => {
        const ok = have.has(`${y}|${rd}|${t}`);
        if (!ok) holes++;
        return (ok ? '✓' : '—').padStart(7);
      });
      const n = entries.filter((e) => e.year === y && e.round === rd).reduce((s, e) => s + e.rows, 0);
      console.log(`  ${`${y} R${rd}`.padEnd(9)}${cells.join('')}${n.toLocaleString().padStart(10)}`);
    }
  }
  return holes;
}

function build(entries: Entry[]) {
  mkdirSync(byYearDir, { recursive: true });
  mkdirSync(finalDir, { recursive: true });
  const years = [...new Set(entries.map((e) => e.year))].sort();
  const summary: Record<string, unknown> = {};

  for (const year of years) {
    const mine = entries.filter((e) => e.year === year);
    const lines = mine.flatMap((e) => dataLines(readFileSync(join(csvDir, e.file), 'utf8')));
    const csv = `${CSV_HEADER}\n${lines.join('\n')}\n`;
    const gz = gzipSync(Buffer.from(csv), { level: 9 });
    writeFileSync(join(byYearDir, `josaa-${year}.csv.gz`), gz);

    // Final round = the highest round JoSAA published that year; this is the seat-allotment
    // that actually stuck, and it's what the forecast corpus trains on.
    const finalRound = mine.map((e) => Number(e.round)).reduce((a, b) => Math.max(a, b), 0);
    const finalLines = mine.filter((e) => Number(e.round) === finalRound)
      .flatMap((e) => dataLines(readFileSync(join(csvDir, e.file), 'utf8')));
    writeFileSync(join(finalDir, `josaa-${year}-${finalRound}.csv`), `${CSV_HEADER}\n${finalLines.join('\n')}\n`);

    summary[year] = {
      rounds: [...new Set(mine.map((e) => e.round))].sort(),
      rows: lines.length, finalRound, finalRoundRows: finalLines.length,
      gzBytes: gz.length, rawBytes: Buffer.byteLength(csv),
    };
    console.log(`  → josaa-${year}.csv.gz  ${lines.length.toLocaleString()} rows  ` +
      `${(Buffer.byteLength(csv) / 1e6).toFixed(1)}MB → ${(gz.length / 1e6).toFixed(2)}MB gz  ` +
      `| final R${finalRound}: ${finalLines.length.toLocaleString()} rows`);
  }

  writeFileSync(join(dataDir, 'manifest.json'), `${JSON.stringify({
    source: 'https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx',
    description: 'Official JoSAA Opening/Closing Rank archive — all rounds, all institute types.',
    schema: CSV_HEADER.split(','),
    builtAt: new Date().toISOString(),
    years: summary,
    partitions: entries,
  }, null, 2)}\n`);
  return summary;
}

function main() {
  const entries = loadEntries();
  if (!entries.length) { console.error('no partitions found — run josaa-orcr.ts first'); process.exit(1); }
  console.log(`JoSAA ORCR — ${entries.length} partitions across ${new Set(entries.map((e) => e.year)).size} years`);

  console.log('\nintegrity:');
  const bad = verify(entries);
  console.log(bad ? `  ${bad} problem(s)` : '  ✓ all partitions present and checksum-clean');

  const holes = coverage(entries);
  const totalRows = entries.reduce((s, e) => s + e.rows, 0);
  console.log(`\n  total: ${totalRows.toLocaleString()} rows${holes ? ` · ${holes} missing cell(s)` : ' · no holes'}`);

  if (process.argv.includes('--verify')) return;
  if (bad) { console.error('\nrefusing to build with integrity failures'); process.exit(1); }
  console.log('\nbuilding artifacts:');
  build(entries);
  console.log('\n✓ done');
}

main();
