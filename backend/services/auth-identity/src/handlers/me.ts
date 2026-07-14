// HTTP handlers for /me and role. Thin: parse -> call domain -> return DTO.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { RankPrefsInput, UpdateProfileInput, SwitchRoleInput } from '../types';
import * as profile from '../domain/profile';

/** GET /me -> UserProfile */
export async function getMe(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(await profile.getMe(p.userId));
}

/** PATCH /me { name? } -> UserProfile */
export async function patchMe(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = UpdateProfileInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid profile update', parsed.error.flatten());
  return c.json(await profile.updateMe(p.userId, parsed.data));
}

/** PATCH /me/rank-prefs { RankPrefs } -> UserProfile */
export async function patchRankPrefs(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = RankPrefsInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid rank/preferences', parsed.error.flatten());
  return c.json(await profile.updateRankPrefs(p.userId, parsed.data));
}

/** POST /me/role { role } -> UserProfile */
export async function postRole(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = SwitchRoleInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid role', parsed.error.flatten());
  return c.json(await profile.switchRole(p.userId, parsed.data.role));
}
