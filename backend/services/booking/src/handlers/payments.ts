// Payment webhook — the saga's completion trigger. PUBLIC route (payment providers
// call it server-to-server), so it is NOT behind the JWT authorizer; instead the
// request MUST be authenticated by verifying the provider's signature.
import type { Context } from 'hono';
import { ValidationError } from '@sc/shared';
import { WebhookInput } from '../types';
import * as booking from '../domain/booking';

/** POST /payments/webhook  (Razorpay-style). */
export async function webhook(c: Context) {
  // TODO(owner): verify `x-razorpay-signature` = HMAC-SHA256(rawBody, webhookSecret)
  // BEFORE parsing — reject with 400 on mismatch. Secret from Secrets Manager.
  const parsed = WebhookInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid webhook payload', parsed.error.flatten());
  return c.json(await booking.handleWebhook(parsed.data));
}
