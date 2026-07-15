// Seed the Catalog table with the offering dataset + flip the active-version pointer.
// Local:  pnpm --filter @sc/catalog seed        (uses DynamoDB Local)
// Cloud:  TABLE_CATALOG=sc-dev-catalog AWS_REGION=ap-south-1 tsx src/seed.ts
import { OFFERINGS, DATASET_VERSION } from '@sc/catalog-core';
import { isLocal } from '@sc/config';
import { seed } from './repo/catalog.repo';
import { ensureCatalogTable } from './dev/local-table';

async function main() {
  if (isLocal()) await ensureCatalogTable();
  await seed(DATASET_VERSION, OFFERINGS);
  // eslint-disable-next-line no-console
  console.log(`Seeded ${OFFERINGS.length} offerings @ version ${DATASET_VERSION} → ${process.env.TABLE_CATALOG}`);
}

void main();
