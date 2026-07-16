// Razorpay REST integration — orders, refunds, webhook-signature verification.
// Uses global fetch + node:crypto (no SDK dependency). Keys come from SSM via
// getSecret(): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
// Every function returns null / false when keys aren't configured, so the app
// degrades gracefully to the dev-payment path instead of crashing.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret } from '@sc/shared';

const API = 'https://api.razorpay.com/v1';

async function basicAuth(): Promise<string | null> {
  const [id, secret] = await Promise.all([getSecret('RAZORPAY_KEY_ID'), getSecret('RAZORPAY_KEY_SECRET')]);
  if (!id || !secret) return null;
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

/** The public Key ID (safe to hand to the browser for Checkout). */
export const razorpayKeyId = (): Promise<string | undefined> => getSecret('RAZORPAY_KEY_ID');

/** Is Razorpay configured (keys present)? */
export async function razorpayEnabled(): Promise<boolean> {
  return Boolean(await getSecret('RAZORPAY_KEY_ID')) && Boolean(await getSecret('RAZORPAY_KEY_SECRET'));
}

/** Create an order for a booking. `amountINR` in rupees → paise. Null if not configured. */
export async function createOrder(amountINR: number, bookingId: string): Promise<{ id: string } | null> {
  const auth = await basicAuth();
  if (!auth) return null;
  const res = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(amountINR * 100), currency: 'INR', receipt: bookingId, notes: { bookingId } }),
  });
  if (!res.ok) throw new Error(`razorpay order create failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<{ id: string }>;
}

/** Full refund of a captured payment. Null if not configured. */
export async function createRefund(paymentId: string): Promise<{ id: string } | null> {
  const auth = await basicAuth();
  if (!auth) return null;
  const res = await fetch(`${API}/payments/${paymentId}/refund`, {
    method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: '{}',
  });
  if (!res.ok) throw new Error(`razorpay refund failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<{ id: string }>;
}

/** Verify a webhook signature = hex HMAC-SHA256(rawBody, webhookSecret), constant-time. */
export async function verifyWebhookSignature(rawBody: string, signature: string | undefined): Promise<boolean> {
  const secret = await getSecret('RAZORPAY_WEBHOOK_SECRET');
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
