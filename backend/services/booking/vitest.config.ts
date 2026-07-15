import { defineConfig } from 'vitest/config';

// Integration tests run against DynamoDB Local on isolated tables. The saga reads
// mentor price/slot from a mentors table, so both are pointed at test tables.
export default defineConfig({
  test: {
    env: {
      STAGE: 'dev',
      AWS_REGION: 'ap-south-1',
      DDB_ENDPOINT: 'http://localhost:8000',
      TABLE_BOOKINGS: 'sc-test-bookings',
      TABLE_MENTORS: 'sc-test-bookings-mentors',
    },
  },
});
