// Video-meeting link for a CONFIRMED session. The same link is stored on the
// booking so BOTH the student and the mentor see it in GET /sessions immediately
// after payment — no per-side generation, one shared room.
//
// TODO(owner): mint a REAL Google Meet link.
//   Recommended: Google Calendar API `events.insert` with
//     conferenceData.createRequest = { requestId, conferenceSolutionKey.type:'hangoutsMeet' }
//     conferenceDataVersion = 1
//     attendees = [student.email, mentor.email]
//     start/end = booking.startsAt .. +durationMin
//   then read `event.hangoutLink` (the https://meet.google.com/xxx-xxxx-xxx URL) and
//   `event.id` (to update/cancel on reschedule/refund). Auth: a Google Workspace
//   service account with domain-wide delegation (or OAuth); secret in Secrets Manager.
//   Calendar API is free — no cost impact. Store { url, provider:'google', eventId }.
//
// Until that's wired we return a clearly-labelled PLACEHOLDER (provider:'stub'). It is
// NOT a working room; the UI must show it as a placeholder. We use the `/lookup/`
// form so a click never drops the user into a random public meeting.
export interface Meeting {
  url: string;
  provider: 'google' | 'stub';
}

export function createMeeting(bookingId: string): Meeting {
  const short = bookingId.replace(/[^a-z0-9]/gi, '').slice(-9).toLowerCase() || 'session';
  return { url: `https://meet.google.com/lookup/sc-${short}`, provider: 'stub' };
}
