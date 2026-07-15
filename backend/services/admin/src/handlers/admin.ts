// Admin-ops endpoints (Phase 7). Role is enforced in the domain (requireRole(p,'admin'))
// on every call; the routes also sit behind the Cognito authorizer in infra.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { SuspendInput, BroadcastInput } from '../types';
import * as admin from '../domain/admin';

/** GET /admin/stats -> cheap platform counters */
export async function stats(c: Context<AppEnv>) {
  return c.json(await admin.stats(getPrincipal(c)));
}

/** GET /admin/audit?limit= -> recent audit entries, newest-first */
export async function audit(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const raw = Number(c.req.query('limit') ?? 50);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 200) : 50;
  return c.json(await admin.audit(p, limit));
}

/** POST /admin/mentors/:id/suspend { reason? } */
export async function suspend(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing mentor id');
  const parsed = SuspendInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid suspend', parsed.error.flatten());
  return c.json(await admin.suspend(p, id, parsed.data));
}

/** POST /admin/mentors/:id/reinstate */
export async function reinstate(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing mentor id');
  return c.json(await admin.reinstate(p, id));
}

/** POST /admin/broadcast { title, body, userIds[] } */
export async function broadcast(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = BroadcastInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid broadcast', parsed.error.flatten());
  return c.json(await admin.broadcast(p, parsed.data));
}
