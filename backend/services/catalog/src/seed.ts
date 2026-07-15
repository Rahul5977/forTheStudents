// Seed the Catalog table from the official JoSAA 2024 CSVs (IITs + NIT/IIIT/GFTI).
// Local:  pnpm --filter @sc/catalog seed
// Cloud:  TABLE_CATALOG=sc-dev-catalog AWS_REGION=ap-south-1 tsx src/seed.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAll, DATASET_VERSION } from '@sc/catalog-core';
import { isLocal } from '@sc/config';
import { seed } from './repo/catalog.repo';
import { ensureCatalogTable } from './dev/local-table';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data');

async function main() {
  const orcr = readFileSync(join(dataDir, 'ORCR.csv'), 'utf8'); // IITs
  const josaa = readFileSync(join(dataDir, 'josaa24.csv'), 'utf8'); // NIT/IIIT/GFTI
  const cutoffs = parseAll(orcr, josaa);
  if (isLocal()) await ensureCatalogTable();
  await seed(DATASET_VERSION, cutoffs);
  // eslint-disable-next-line no-console
  console.log(`Seeded ${cutoffs.length} official cutoffs @ ${DATASET_VERSION} → ${process.env.TABLE_CATALOG}`);
}

void main();
