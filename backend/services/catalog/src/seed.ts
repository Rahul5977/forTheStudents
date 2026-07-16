// Seed the Catalog table from the multi-year JoSAA corpus with precomputed 2026 forecasts.
// Local:  pnpm --filter @sc/catalog seed
// Cloud:  TABLE_CATALOG=sc-dev-catalog AWS_REGION=ap-south-1 tsx src/seed.ts
//
// The served snapshot = the current year's (2024) rows, each augmented with its 2026
// forecast band + closing-rank history (computed here at seed time, not per request).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DATASET_VERSION } from '@sc/catalog-core';
import { isLocal } from '@sc/config';
import { seed } from './repo/catalog.repo';
import { ensureCatalogTable } from './dev/local-table';
import { buildEnrichedCorpus, type CorpusFile } from './domain/build-corpus';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data');
const historyDir = join(dataDir, 'history');
const read = (p: string) => readFileSync(p, 'utf8');

async function main() {
  // History CSVs carry their own Year/Round columns; josaa24 is stamped 2024/R6.
  const files: CorpusFile[] = [
    { text: read(join(historyDir, 'josaa-2018-7.csv')) },
    { text: read(join(historyDir, 'josaa-2019-7.csv')) },
    { text: read(join(historyDir, 'josaa-2020-6.csv')) },
    { text: read(join(dataDir, 'josaa24.csv')), year: 2024, round: 6 },
  ];
  const { enriched, targetYear, stats } = buildEnrichedCorpus(files);

  if (isLocal()) await ensureCatalogTable();
  await seed(DATASET_VERSION, enriched);

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${stats.currentRows} current-year cutoffs @ ${DATASET_VERSION} → ${process.env.TABLE_CATALOG}\n` +
    `  corpus rows: ${stats.rows} | series: ${stats.series} | with ${targetYear} forecast: ${stats.withForecast} ` +
    `(${stats.confidentForecast} confident)`,
  );
}

void main();
