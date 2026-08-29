// Video-meeting link for a CONFIRMED session. The same link is stored on the booking so
// BOTH the student and the mentor see it in GET /sessions immediately after payment — one
// shared room, no per-side generation.
//
// Phase 11: minted through the shared CalendarProvider (@sc/shared calendar.ts) —
// `CALENDAR_PROVIDER=google` creates a real Google Calendar event with a Meet link (service
// account with domain-wide delegation; creds in the SSM secrets blob); `stub` (default) returns a
// clearly-labelled placeholder (`/lookup/` form — never a random public room).
import { getCalendarProvider, stubMeetUrl, createLogger } from '@sc/shared';

const logger = createLogger('booking.meeting');

export interface Meeting {
  url: string;
  provider: 'google' | 'stub';
  eventId?: string;
}

/** Synchronous placeholder — used only as the last-resort fallback (see mintMeeting). */
export function createMeeting(bookingId: string): Meeting {
  return { url: stubMeetUrl(bookingId), provider: 'stub' };
}

/**
 * Mint the shared room for a paid session. A Calendar failure must NOT fail a captured payment,
 * so on error we fall back to the placeholder and log loudly (ops can re-mint by hand).
 * TODO(owner): attendee emails — the booking row holds ids only; add them once the users
 * read-model exposes a verified email (the Calendar invite then doubles as the email reminder).
 */
export async function mintMeeting(b: { id: string; startsAt: string; durationMin: number; mentorName?: string }): Promise<Meeting> {
  try {
    const cal = await getCalendarProvider();
    const ev = await cal.create({
      summary: `Student-Counselor session${b.mentorName ? ` with ${b.mentorName}` : ''}`,
      startsAt: b.startsAt, durationMin: b.durationMin, attendees: [], requestId: `bk-${b.id}`,
    });
    return { url: ev.meetUrl, provider: ev.provider, eventId: ev.eventId };
  } catch (err) {
    logger.error('meeting mint failed — falling back to placeholder link', { bookingId: b.id, err: (err as Error).message });
    return createMeeting(b.id);
  }
}
