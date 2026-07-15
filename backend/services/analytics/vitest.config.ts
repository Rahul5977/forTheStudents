import { defineConfig } from 'vitest/config';

// Phase 8 tests are PURE (toLine + reconcile) — no DynamoDB/S3 needed. The env here
// only exists so `@sc/config`'s schema parses at import time if a module reads it.
export default defineConfig({
  test: {
    env: {
      STAGE: 'dev',
      AWS_REGION: 'ap-south-1',
      TABLE_BOOKINGS: 'sc-test-bookings',
      BUCKET_ANALYTICS: 'sc-test-analytics',
    },
  },
});
