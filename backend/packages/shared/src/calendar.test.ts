// Phase 11 packet 5: the stub provider (always) + the Google provider against a FAKE fetch
// (always) + a real contract test that only runs when service-account creds are present.
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GoogleCalendarProvider, StubCalendarProvider, buildServiceAccountAssertion, stubMeetUrl } from './calendar';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });

describe('StubCalendarProvider', () => {
  it('creates a deterministic placeholder link, updates and cancels', async () => {
    const p = new StubCalendarProvider();
    const ev = await p.create({ summary: 'x', startsAt: '2026-09-01T10:00:00.000Z', durationMin: 15, attendees: [], requestId: 'iv-mentor_1-2026' });
    expect(ev.provider).toBe('stub');
    expect(ev.meetUrl).toBe(stubMeetUrl('iv-mentor_1-2026'));
    expect(ev.meetUrl).toMatch(/^https:\/\/meet\.google\.com\/lookup\//);
    const up = await p.update(ev.eventId, { startsAt: '2026-09-02T10:00:00.000Z' });
    expect(up.eventId).toBe(ev.eventId);
    await p.cancel(ev.eventId);
    expect(p.events.has(ev.eventId)).toBe(false);
  });
});

describe('GoogleCalendarProvider (fake fetch)', () => {
  it('signs a service-account assertion with the impersonated user as `sub`', () => {
    const jwt = buildServiceAccountAssertion({ clientEmail: 'sa@x.iam', privateKey, impersonate: 'ops@x.in' }, 1_700_000_000);
    const [h, c, sig] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims.sub).toBe('ops@x.in');
    expect(claims.scope).toContain('auth/calendar');
    expect(claims.exp - claims.iat).toBe(3600);
    expect(sig.length).toBeGreaterThan(100);
  });

  it('exchanges the token once, inserts with conferenceDataVersion=1 + hangoutsMeet, reads hangoutLink; patch + delete hit the event', async () => {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ method: init?.method ?? 'GET', url: u, body: init?.body ? (typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body) : undefined });
      if (u.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ id: 'evt_1', hangoutLink: 'https://meet.google.com/abc-defg-hij', htmlLink: 'https://calendar.google.com/x' }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new GoogleCalendarProvider({ clientEmail: 'sa@x.iam', privateKey, impersonate: 'ops@x.in', fetchImpl });
    const ev = await p.create({ summary: 'Mentor interview', startsAt: '2026-09-01T10:00:00.000Z', durationMin: 15, attendees: ['m@iitb.ac.in', 'admin@x.in'], requestId: 'iv-1' });
    expect(ev).toMatchObject({ provider: 'google', eventId: 'evt_1', meetUrl: 'https://meet.google.com/abc-defg-hij' });
    const insert = calls.find((c) => c.method === 'POST' && c.url.includes('/events?'));
    expect(insert?.url).toContain('conferenceDataVersion=1');
    expect(insert?.url).toContain('sendUpdates=all');
    const body = insert?.body as { conferenceData: { createRequest: { requestId: string; conferenceSolutionKey: { type: string } } }; attendees: { email: string }[]; end: { dateTime: string } };
    expect(body.conferenceData.createRequest).toEqual({ requestId: 'iv-1', conferenceSolutionKey: { type: 'hangoutsMeet' } });
    expect(body.attendees).toEqual([{ email: 'm@iitb.ac.in' }, { email: 'admin@x.in' }]);
    expect(body.end.dateTime).toBe('2026-09-01T10:15:00.000Z');

    await p.update('evt_1', { startsAt: '2026-09-02T10:00:00.000Z', durationMin: 15 });
    await p.cancel('evt_1');
    expect(calls.filter((c) => c.url.includes('oauth2')).length).toBe(1); // token cached
    expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('/events/evt_1'))).toBe(true);
    expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/events/evt_1'))).toBe(true);
  });
});

// Real contract test — skipped unless the owner exports the creds. Never fabricated.
describe.skipIf(!process.env.GOOGLE_SA_JSON || !process.env.GOOGLE_CALENDAR_IMPERSONATE)('GoogleCalendarProvider (LIVE contract)', () => {
  it('creates, reschedules and cancels a real event with a Meet link', async () => {
    const sa = JSON.parse(process.env.GOOGLE_SA_JSON!) as { client_email: string; private_key: string };
    const p = new GoogleCalendarProvider({ clientEmail: sa.client_email, privateKey: sa.private_key, impersonate: process.env.GOOGLE_CALENDAR_IMPERSONATE! });
    const startsAt = new Date(Date.now() + 86_400_000).toISOString();
    const ev = await p.create({ summary: '[sc contract test] interview', startsAt, durationMin: 15, attendees: [], requestId: `sc-contract-${Date.now()}` });
    expect(ev.meetUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    await p.update(ev.eventId, { startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), durationMin: 15 });
    await p.cancel(ev.eventId);
  });
});
