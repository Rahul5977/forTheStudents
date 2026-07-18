// Admin directory endpoint. Role is enforced in the domain (requireRole(p,'admin')).
import type { Context } from 'hono';
import { getPrincipal, type AppEnv } from '@sc/shared';
import * as adminUsers from '../domain/admin-users';

/** GET /admin/users -> directory + live/active counts (admin only). */
export async function listUsers(c: Context<AppEnv>) {
  return c.json(await adminUsers.listUsers(getPrincipal(c)));
}
