// POST /auth/bootstrap — called by the frontend right after Cognito sign-in to
// ensure a profile row exists. Idempotent.
import type { Context } from 'hono';
import { getPrincipal, type AppEnv } from '@sc/shared';
import * as profile from '../domain/profile';

/** POST /auth/bootstrap -> UserProfile */
export async function bootstrap(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(await profile.bootstrap(p));
}
