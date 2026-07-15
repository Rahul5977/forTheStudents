// Feed API (authed): the caller acts on their own USER#<sub> notifications.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { PrefsInput } from '../types';
import * as notif from '../domain/notifications';

/** GET /notifications -> { unread, notifications[] } */
export async function feed(c: Context<AppEnv>) {
  return c.json(await notif.feed(getPrincipal(c).userId));
}

/** POST /notifications/:id/read */
export async function markRead(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing notification id');
  return c.json(await notif.markRead(p.userId, id));
}

/** POST /notifications/read-all */
export async function markAllRead(c: Context<AppEnv>) {
  return c.json(await notif.markAllRead(getPrincipal(c).userId));
}

/** GET /notifications/prefs */
export async function getPrefs(c: Context<AppEnv>) {
  return c.json(await notif.getPrefs(getPrincipal(c).userId));
}

/** PUT /notifications/prefs */
export async function putPrefs(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = PrefsInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid prefs', parsed.error.flatten());
  return c.json(await notif.putPrefs(p.userId, parsed.data));
}
