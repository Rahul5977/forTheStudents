// Unit test for the Razorpay webhook signature check (money-critical). Uses the
// env fallback in getSecret (no SSM param set in tests) to inject the secret.
import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { clearSecretsCache } from '@sc/shared';
import { verifyWebhookSignature } from '../src/repo/razorpay';

const SECRET = 'whsec_test_123';
const sign = (body: string) => createHmac('sha256', SECRET).update(body).digest('hex');

describe('razorpay webhook signature verification', () => {
  beforeEach(() => { process.env.RAZORPAY_WEBHOOK_SECRET = SECRET; clearSecretsCache(); });

  it('accepts a correctly-signed body', async () => {
    const body = '{"event":"payment.captured","payload":{}}';
    expect(await verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it('rejects a tampered body (signature no longer matches)', async () => {
    const body = '{"event":"payment.captured"}';
    const sig = sign(body);
    expect(await verifyWebhookSignature(body + ' ', sig)).toBe(false);
  });

  it('rejects a wrong/garbage signature', async () => {
    expect(await verifyWebhookSignature('{"event":"x"}', 'deadbeef')).toBe(false);
  });

  it('rejects when the signature header is missing', async () => {
    expect(await verifyWebhookSignature('{}', undefined)).toBe(false);
  });

  it('rejects when no webhook secret is configured', async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET; clearSecretsCache();
    const body = '{}';
    expect(await verifyWebhookSignature(body, sign(body))).toBe(false);
  });
});
