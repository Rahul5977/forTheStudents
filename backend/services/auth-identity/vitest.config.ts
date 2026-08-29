import { defineConfig } from 'vitest/config';

// Local integration tests run against DynamoDB Local (`pnpm dev:db` at the backend root).
//
// WHY these env vars live here: `@sc/shared/ddb` reads process.env.DDB_ENDPOINT and
// `@sc/config` reads process.env.TABLE_USERS at *import time* (module top-level). Vitest
// applies `test.env` to process.env BEFORE it imports any test file (and therefore before
// those modules load), so the DynamoDB client is pointed at localhost:8000 from the start.
// Change nothing in src to test locally — the endpoint is purely env-driven.
export default defineConfig({
  test: {
    env: {
      STAGE: 'dev',
      AWS_REGION: 'ap-south-1',
      DDB_ENDPOINT: 'http://localhost:8000',
      // Isolated table so tests never mutate the dev data you inspect in the console.
      TABLE_USERS: 'sc-test-users',
      TABLE_AUDIT: 'sc-test-auth-audit',
      // Phase 11: the superadmin bootstrap tests match against this (verified-email, case-insensitive).
      SUPERADMIN_EMAIL: 'Owner.Person@Example.com',
    },
  },
});
