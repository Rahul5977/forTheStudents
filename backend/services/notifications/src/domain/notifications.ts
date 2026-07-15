// Business logic: turn domain events into per-user in-app notifications (fanout),
// and serve the feed / read-state / prefs. Channel adapters (email/push/WhatsApp)
// are wired here behind prefs — currently in-app only; the rest is `// TODO(owner)`.
import { NotFoundError } from '@sc/shared';
import { notificationsRepo, type Prefs } from '../repo/notifications.repo';

const now = () => new Date().toISOString();

interface Fanned { userId: string; type: string; title: string; body: string; link?: string }

/**
 * Map one domain event → the notifications it produces (one event can notify
 * several users). Keep this table-driven and pure so it's trivially testable.
 */
export function fanout(type: string, detail: Record<string, unknown>): Fanned[] {
  const out: Fanned[] = [];
  const s = (k: string) => detail[k] as string | undefined;
  switch (type) {
    case 'booking.confirmed': {
      if (s('studentId')) out.push({ userId: s('studentId')!, type, title: 'Session confirmed 🎉', body: 'Your mentor session is booked. The Google Meet link is ready.', link: s('meetingUrl') });
      if (s('mentorId')) out.push({ userId: s('mentorId')!, type, title: 'New session booked', body: 'A student booked a session with you. Meet link is ready.', link: s('meetingUrl') });
      break;
    }
    case 'mentor.approved':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: "You're a verified mentor ✅", body: 'Your profile is approved — students can now find and book you.' });
      break;
    case 'mentor.rejected':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'Verification update', body: 'Your mentor application needs another look. Check your email for details.' });
      break;
    case 'session.rated':
      if (s('mentorId')) out.push({ userId: s('mentorId')!, type, title: `New rating ⭐ ${detail.rating ?? ''}`.trim(), body: 'A student rated your session. Nice work!' });
      break;
    case 'refund.issued':
      if (s('studentId')) out.push({ userId: s('studentId')!, type, title: 'Refund issued', body: 'Your session was cancelled and a refund has been initiated.' });
      break;
    default:
      break; // unmapped events are ignored (safe)
  }
  return out;
}

/** Ingest one event → write the fanned-out notifications. Returns how many written. */
export async function ingest(type: string, detail: Record<string, unknown>): Promise<number> {
  const items = fanout(type, detail);
  const t = now();
  await Promise.all(items.map(async (i) => {
    const prefs = await notificationsRepo.getPrefs(i.userId);
    if (prefs.inApp) await notificationsRepo.add(i.userId, { type: i.type, title: i.title, body: i.body, link: i.link, now: t });
    // TODO(owner): if prefs.email → SES; prefs.push → FCM; prefs.whatsapp → BSP send.
    // Each behind cfg.channels + a per-channel adapter; in-app is the free default.
  }));
  return items.length;
}

// ── Feed API ────────────────────────────────────────────────────────────────
export async function feed(userId: string) {
  const items = await notificationsRepo.list(userId);
  return { unread: items.filter((n) => !n.read).length, notifications: items };
}

export async function markRead(userId: string, id: string) {
  try { await notificationsRepo.markRead(userId, id); }
  catch (e) { if ((e as { name?: string }).name === 'ConditionalCheckFailedException') throw NotFoundError('Notification not found.'); throw e; }
  return { ok: true };
}

export async function markAllRead(userId: string) {
  return { marked: await notificationsRepo.markAllRead(userId) };
}

export async function getPrefs(userId: string) {
  return notificationsRepo.getPrefs(userId);
}

export async function putPrefs(userId: string, prefs: Prefs) {
  return notificationsRepo.putPrefs(userId, prefs);
}
