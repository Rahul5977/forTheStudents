// Shortlist endpoints. Per-user, behind the Cognito JWT authorizer.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { PutShortlistInput } from '../types';
import * as planner from '../domain/planner';

/** GET /shortlist -> { collegeIds, version } */
export async function getShortlist(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(await planner.getShortlist(p.userId));
}

/** PUT /shortlist { collegeIds, version? } -> { collegeIds, version } */
export async function putShortlist(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = PutShortlistInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid shortlist', parsed.error.flatten());
  return c.json(await planner.putShortlist(p.userId, parsed.data));
}
