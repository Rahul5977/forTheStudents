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
  // 2021–2023 were acquired from public JoSAA mirrors (final round R6), validated against
  // an independent source, and normalized to the 9-col history schema — see
  // backend/docs/forecast-data-acquisition.md. They fill the 2020→2024 gap so each series
  // trends on 6 points instead of 4; the served snapshot stays 2024 (the latest year here).
  // TODO(owner): josaa-2025-6.csv is acquired + validated on disk but intentionally NOT
  // registered — adding it would make 2025 the latest year and roll the served snapshot
  // forward from 2024. Register it (and reseed with a fresh DATASET_VERSION) only when the
  // product decision to serve the 2025 cycle is made.
  const files: CorpusFile[] = [
    { text: read(join(historyDir, 'josaa-2018-7.csv')) },
    { text: read(join(historyDir, 'josaa-2019-7.csv')) },
    { text: read(join(historyDir, 'josaa-2020-6.csv')) },
    { text: read(join(historyDir, 'josaa-2021-6.csv')) },
    { text: read(join(historyDir, 'josaa-2022-6.csv')) },
    { text: read(join(historyDir, 'josaa-2023-6.csv')) },
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
