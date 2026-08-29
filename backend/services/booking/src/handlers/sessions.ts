// Session lifecycle endpoints (authed): list, join, end, rate.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { RateInput } from '../types';
import * as booking from '../domain/booking';

/** GET /sessions — my sessions (as student and/or mentor) */
export async function list(c: Context<AppEnv>) {
  return c.json(await booking.listSessions(getPrincipal(c)));
}

/** POST /sessions/:id/join -> { token, roomId, role } */
export async function join(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing session id');
  return c.json(await booking.join(p, id));
}

/** POST /sessions/:id/end */
export async function end(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing session id');
  return c.json(await booking.endSession(p, id));
}

/** POST /sessions/:id/rate { rating, comment? } */
export async function rate(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing session id');
  const parsed = RateInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid rating', parsed.error.flatten());
  return c.json(await booking.rate(p, id, parsed.data));
}

/** GET /sessions/:id/student-prep — mentor-only prep sheet for a booked student (Phase 11) */
export async function studentPrep(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing session id');
  return c.json(await booking.studentPrep(p, id));
}
