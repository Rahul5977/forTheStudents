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
    case 'booking.requested':
      if (s('mentorId')) out.push({ userId: s('mentorId')!, type, title: 'New session request 🙋', body: 'A student requested a 1:1 with you. Accept or decline it from your bookings.' });
      break;
    case 'booking.accepted':
      if (s('studentId')) out.push({ userId: s('studentId')!, type, title: 'Request accepted ✅', body: `${detail.mentorName ?? 'Your mentor'} accepted your request — pay now to confirm the session.` });
      break;
    case 'booking.rejected':
      if (s('studentId')) out.push({ userId: s('studentId')!, type, title: 'Request declined', body: `${detail.mentorName ?? 'The mentor'} can't take this slot. Try another slot or mentor.` });
      break;
    case 'booking.confirmed': {
      if (s('studentId')) out.push({ userId: s('studentId')!, type, title: 'Session confirmed 🎉', body: 'Your mentor session is booked. The Google Meet link is ready.', link: s('meetingUrl') });
      if (s('mentorId')) out.push({ userId: s('mentorId')!, type, title: 'New session booked', body: 'A student booked a session with you. Meet link is ready.', link: s('meetingUrl') });
      break;
    }
    case 'mentor.approved':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: "You're a verified mentor ✅", body: 'Your profile is approved — students can now find and book you.' });
      break;
    case 'mentor.rejected':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'Application not approved', body: s('reason') ? `Your mentor application was not approved: ${s('reason')}` : 'Your mentor application was not approved. Open your application status for details.' });
      break;
    // Phase 11 — the verification pipeline keeps the applicant informed at every stage.
    case 'mentor.verification.submitted':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'Application received ✅', body: 'Thanks — we have your mentor application. We verify every detail manually, usually within 24–48 hours.' });
      break;
    case 'mentor.docs.verified':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'Documents verified 🪪', body: 'Every detail on your application checked out. Next step: a short screening interview — we will schedule it soon.' });
      break;
    case 'mentor.docs.unverified':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'A detail needs another look', body: 'An admin flagged one of your application details. No action needed yet — we will reach out if we need anything from you.' });
      break;
    case 'mentor.revision_requested':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'Please update your application ✏️', body: s('reason') ? `Fix this and re-submit: ${s('reason')}` : 'Your application needs a fix before we can continue. Open your application status to see what.' });
      break;
    case 'mentor.interview.scheduled':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'Mentor interview scheduled 📅', body: 'A short screening interview has been scheduled for your mentor application. You will also get a calendar invite. Check your application status for the time + Meet link.', link: s('interviewLink') });
      break;
    case 'mentor.interview.rescheduled':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'Interview rescheduled 📅', body: 'Your mentor interview has a new time. Your calendar invite is updated — check your application status for details.', link: s('interviewLink') });
      break;
    case 'mentor.interview.cancelled':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'Interview cancelled', body: 'Your mentor interview was cancelled. We will schedule a new one — nothing to do on your side.' });
      break;
    case 'mentor.suspended':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: 'Mentor profile suspended', body: s('reason') ? `Your mentor profile is suspended: ${s('reason')}` : 'Your mentor profile is suspended and hidden from students. Contact support if you think this is a mistake.' });
      break;
    case 'mentor.reinstated':
      if (s('userId')) out.push({ userId: s('userId')!, type, title: "You're back on the marketplace ✅", body: 'Your mentor profile is active again — students can find and book you.' });
      break;
    case 'session.rated':
      if (s('mentorId')) out.push({ userId: s('mentorId')!, type, title: `New rating ⭐ ${detail.rating ?? ''}`.trim(), body: 'A student rated your session. Nice work!' });
      break;
    case 'refund.issued':
      if (s('studentId')) out.push({ userId: s('studentId')!, type, title: 'Refund issued', body: 'Your session was cancelled and a refund has been initiated.' });
      break;
    case 'admin.broadcast': {
      const ids = Array.isArray(detail.userIds) ? (detail.userIds as string[]) : [];
      const title = s('title') ?? 'Announcement';
      const body = s('body') ?? '';
      for (const uid of ids) out.push({ userId: uid, type, title, body });
      break;
    }
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
