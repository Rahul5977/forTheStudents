// Reproducible forecast backtest over the JoSAA corpus. Holds out a year, forecasts it
// from earlier years only, and reports point error + band coverage.
//   pnpm --filter @sc/catalog exec tsx scripts/backtest.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCorpus, buildSeries } from '@sc/catalog-core';
import { backtestYear, formatReport } from '@sc/forecast';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data');
const H = join(dataDir, 'history');

// Each history file carries its own Year/Round columns; josaa24 is stamped 2024/R6.
const files: { text: string; year?: number; round?: number }[] = [
  { text: readFileSync(join(H, 'josaa-2018-7.csv'), 'utf8') },
  { text: readFileSync(join(H, 'josaa-2019-7.csv'), 'utf8') },
  { text: readFileSync(join(H, 'josaa-2020-6.csv'), 'utf8') },
  { text: readFileSync(join(dataDir, 'josaa24.csv'), 'utf8'), year: 2024, round: 6 },
];
const series = buildSeries(parseCorpus(files));
const years = [...new Set(series.flatMap((s) => s.points.map((p) => p.year)))].sort();
console.log(`corpus years: ${years.join(', ')} | ${series.length} series\n`);

// Backtest every year that has ≥2 earlier years to train on.
for (const y of years) {
  if (years.filter((v) => v < y).length < 2) continue;
  console.log(formatReport(backtestYear(series, y, 2)));
  console.log();
}
