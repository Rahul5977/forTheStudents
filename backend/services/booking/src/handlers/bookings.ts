// Booking endpoints (authed). Create honours an `Idempotency-Key` header.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { CreateBookingInput } from '../types';
import * as booking from '../domain/booking';

/** POST /bookings  (header: Idempotency-Key) */
export async function create(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = CreateBookingInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid booking', parsed.error.flatten());
  const idempKey = c.req.header('idempotency-key');
  return c.json(await booking.createBooking(p, parsed.data, idempKey));
}

/** POST /bookings/:id/cancel */
export async function cancel(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing booking id');
  return c.json(await booking.cancel(p, id));
}

/** POST /bookings/:id/accept  (mentor accepts a request → creates the payment order) */
export async function accept(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing booking id');
  return c.json(await booking.accept(p, id));
}

/** POST /bookings/:id/decline  (mentor declines a request → releases the slot) */
export async function decline(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing booking id');
  return c.json(await booking.decline(p, id));
}

/** GET /bookings/:id  (booking + ledger, participants only) */
export async function getOne(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing booking id');
  return c.json(await booking.getBooking(p, id));
}
