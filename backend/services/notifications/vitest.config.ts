import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      STAGE: 'dev',
      AWS_REGION: 'ap-south-1',
      DDB_ENDPOINT: 'http://localhost:8000',
      TABLE_NOTIFICATIONS: 'sc-test-notifications',
    },
  },
});
