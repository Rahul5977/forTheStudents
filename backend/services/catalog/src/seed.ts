// Seed the Catalog table from the official JoSAA 2024 CSVs (IITs + NIT/IIIT/GFTI).
// Local:  pnpm --filter @sc/catalog seed
// Cloud:  TABLE_CATALOG=sc-dev-catalog AWS_REGION=ap-south-1 tsx src/seed.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCutoffs, DATASET_VERSION } from '@sc/catalog-core';
import { isLocal } from '@sc/config';
import { seed } from './repo/catalog.repo';
import { ensureCatalogTable } from './dev/local-table';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data');

async function main() {
  // josaa24.csv covers ALL institutes (IITs + NITs + IIITs + GFTIs).
  const cutoffs = parseCutoffs(readFileSync(join(dataDir, 'josaa24.csv'), 'utf8'));
  if (isLocal()) await ensureCatalogTable();
  await seed(DATASET_VERSION, cutoffs);
  // eslint-disable-next-line no-console
  console.log(`Seeded ${cutoffs.length} official cutoffs @ ${DATASET_VERSION} → ${process.env.TABLE_CATALOG}`);
}

void main();
