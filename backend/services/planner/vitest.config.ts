import { defineConfig } from 'vitest/config';

// Integration tests run against DynamoDB Local on SEPARATE tables so they never
// touch dev data. (`pnpm dev:db` must be running.) The planner doctor endpoint
// reads the catalog snapshot, so both test tables are pointed at the isolated set.
export default defineConfig({
  test: {
    env: {
      STAGE: 'dev',
      AWS_REGION: 'ap-south-1',
      DDB_ENDPOINT: 'http://localhost:8000',
      TABLE_PLANNER: 'sc-test-planner',
      // Own catalog table (NOT sc-test-catalog) so this suite and @sc/catalog's
      // suite don't clobber each other's snapshot when turbo runs them in parallel.
      TABLE_CATALOG: 'sc-test-catalog-planner',
    },
  },
});
