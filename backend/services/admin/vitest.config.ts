import { defineConfig } from 'vitest/config';

// Integration tests run against DynamoDB Local on isolated tables so they never
// touch dev data. (`pnpm dev:db` must be running.)
export default defineConfig({
  test: {
    env: {
      STAGE: 'dev',
      AWS_REGION: 'ap-south-1',
      DDB_ENDPOINT: 'http://localhost:8000',
      TABLE_AUDIT: 'sc-test-audit',
      // Dedicated mentors table so the admin suite's status counts stay isolated from
      // the marketplace suite (which also seeds MENTOR#APPROVED rows into DynamoDB Local).
      // Mirrors the booking suite's `sc-test-bookings-mentors` isolation.
      TABLE_MENTORS: 'sc-test-admin-mentors',
    },
  },
});
