import { defineConfig } from 'vitest/config';

// Integration tests run against DynamoDB Local on an isolated table so they never
// touch dev data. (`pnpm dev:db` must be running.)
export default defineConfig({
  test: {
    env: {
      STAGE: 'dev',
      AWS_REGION: 'ap-south-1',
      DDB_ENDPOINT: 'http://localhost:8000',
      TABLE_MENTORS: 'sc-test-mentors',
    },
  },
});
