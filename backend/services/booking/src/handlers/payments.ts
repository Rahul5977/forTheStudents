// Payment webhook — the saga's completion trigger. PUBLIC route (Razorpay calls it
// server-to-server), so it is NOT behind the JWT authorizer; instead we authenticate
// it by verifying the Razorpay signature over the RAW body.
import type { Context } from 'hono';
import { ValidationError, UnauthorizedError } from '@sc/shared';
import { getEnv } from '@sc/config';
import { WebhookInput } from '../types';
import { verifyWebhookSignature } from '../repo/razorpay';
import * as booking from '../domain/booking';

/** POST /payments/webhook */
export async function webhook(c: Context) {
  const raw = await c.req.text();
  const signature = c.req.header('x-razorpay-signature');

  // ── Real Razorpay: verify the HMAC signature over the raw body, then map + run. ──
  if (signature) {
    if (!(await verifyWebhookSignature(raw, signature))) throw UnauthorizedError('Invalid webhook signature');
    let evt: unknown;
    try { evt = JSON.parse(raw); } catch { throw ValidationError('Invalid JSON body'); }
    return c.json(await booking.handleRazorpayEvent(evt));
  }

  // ── Dev path (non-prod only): the { bookingId, providerPaymentId, event } shape ──
  // used by the dev "simulate payment" button + the integration tests.
  if (getEnv().STAGE === 'prod') throw UnauthorizedError('Missing webhook signature');
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : {}; } catch { throw ValidationError('Invalid JSON body'); }
  const parsed = WebhookInput.safeParse(body);
  if (!parsed.success) throw ValidationError('Invalid webhook payload', parsed.error.flatten());
  return c.json(await booking.handleWebhook(parsed.data));
}
