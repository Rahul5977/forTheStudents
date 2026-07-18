// Admin directory + superadmin admin-management. Roles enforced in the domain.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import * as adminUsers from '../domain/admin-users';
import * as admins from '../domain/admins';

/** GET /admin/users -> directory + live/active counts (admin only). */
export async function listUsers(c: Context<AppEnv>) {
  return c.json(await adminUsers.listUsers(getPrincipal(c)));
}

/** GET /admin/admins -> the admin team + their scopes (superadmin only). */
export async function listAdmins(c: Context<AppEnv>) {
  return c.json(await admins.listAdmins(getPrincipal(c)));
}

/** POST /admin/admins { userId, permissions[] } -> promote/update an admin (superadmin only). */
export async function createAdmin(c: Context<AppEnv>) {
  const body = await c.req.json().catch(() => ({})) as { userId?: string; permissions?: unknown };
  if (!body.userId) throw ValidationError('userId is required');
  return c.json(await admins.setAdmin(getPrincipal(c), body.userId, body.permissions));
}

/** PATCH /admin/admins/:id { permissions[] } -> update an admin's scopes (superadmin only). */
export async function updateAdmin(c: Context<AppEnv>) {
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing user id');
  const body = await c.req.json().catch(() => ({})) as { permissions?: unknown };
  return c.json(await admins.setAdmin(getPrincipal(c), id, body.permissions));
}

/** POST /admin/admins/:id/demote -> back to student (superadmin only). */
export async function demoteAdmin(c: Context<AppEnv>) {
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing user id');
  return c.json(await admins.demoteAdmin(getPrincipal(c), id));
}
