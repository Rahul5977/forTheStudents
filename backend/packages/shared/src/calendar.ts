// Phase 11 packet 5 — meeting links (Google Meet) for interviews AND paid sessions, behind one
// provider interface so tests run on the stub and prod runs on Google Calendar.
//
// GoogleCalendarProvider: Calendar API `events.insert` with
//   conferenceData.createRequest = { requestId, conferenceSolutionKey.type: 'hangoutsMeet' },
//   conferenceDataVersion=1, sendUpdates=all (the attendee INVITATION is the email invite).
// Auth: a Google Workspace SERVICE ACCOUNT with domain-wide delegation, impersonating a real
// Workspace user (Meet links can only be created on a human calendar). The SA JSON + the user
// to impersonate live in the SSM secrets blob (GROUND TRUTH §4 — SSM, not Secrets Manager):
//   GOOGLE_SA_JSON='{"client_email":"…","private_key":"-----BEGIN …"}'
//   GOOGLE_CALENDAR_IMPERSONATE='ops@yourdomain.in'
// No SDK dependency: the OAuth2 JWT is signed with node:crypto and the API is plain fetch.
import { createSign } from 'node:crypto';
import { getEnv } from '@sc/config';
import { ServiceUnavailableError } from './errors';
import { getSecret } from './secrets';
import { newId } from './ids';
import { createLogger } from './logger';

const logger = createLogger('calendar');

export interface CalendarEventInput {
  summary: string;
  description?: string;
  /** ISO start */
  startsAt: string;
  durationMin: number;
  /** attendee emails — each receives the Calendar invitation */
  attendees: string[];
  /** stable id → a retried create never mints a second Meet room */
  requestId: string;
}

export interface CalendarEvent {
  provider: 'google' | 'stub';
  eventId: string;
  meetUrl: string;
  htmlLink?: string;
}

export interface CalendarProvider {
  readonly name: 'google' | 'stub';
  create(input: CalendarEventInput): Promise<CalendarEvent>;
  update(eventId: string, patch: Partial<Pick<CalendarEventInput, 'startsAt' | 'durationMin' | 'summary' | 'description' | 'attendees'>>): Promise<CalendarEvent>;
  cancel(eventId: string): Promise<void>;
}

// ── Stub: deterministic placeholder links (dev/tests/no creds) ────────────────────
/** NOT a working room; the UI labels it as a placeholder. `/lookup/` never drops a user into a random public meeting. */
export function stubMeetUrl(seed: string): string {
  const short = seed.replace(/[^a-z0-9]/gi, '').slice(-9).toLowerCase() || 'session';
  return `https://meet.google.com/lookup/sc-${short}`;
}

export class StubCalendarProvider implements CalendarProvider {
  readonly name = 'stub' as const;
  /** in-memory record so update/cancel behave; lives for the process only */
  readonly events = new Map<string, CalendarEventInput>();
  async create(input: CalendarEventInput): Promise<CalendarEvent> {
    const eventId = `stub_${newId()}`;
    this.events.set(eventId, input);
    return { provider: 'stub', eventId, meetUrl: stubMeetUrl(input.requestId) };
  }
  async update(eventId: string, patch: Partial<CalendarEventInput>): Promise<CalendarEvent> {
    const cur = this.events.get(eventId);
    if (cur) this.events.set(eventId, { ...cur, ...patch });
    return { provider: 'stub', eventId, meetUrl: stubMeetUrl(cur?.requestId ?? eventId) };
  }
  async cancel(eventId: string): Promise<void> {
    this.events.delete(eventId);
  }
}

// ── Google ────────────────────────────────────────────────────────────────────────
export interface GoogleCalendarConfig {
  clientEmail: string;
  privateKey: string;
  /** Workspace user whose calendar owns the events (domain-wide delegation `sub`). */
  impersonate: string;
  calendarId?: string;
  /** injectable for tests */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Build + sign the OAuth2 service-account JWT assertion (RS256). Exported for unit tests. */
export function buildServiceAccountAssertion(cfg: Pick<GoogleCalendarConfig, 'clientEmail' | 'privateKey' | 'impersonate'>, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: cfg.clientEmail,
    sub: cfg.impersonate,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const sig = signer.sign(cfg.privateKey);
  return `${header}.${claims}.${b64url(sig)}`;
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'google' as const;
  private token: { value: string; exp: number } | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  constructor(private readonly cfg: GoogleCalendarConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.now = cfg.now ?? (() => Date.now());
  }

  private async accessToken(): Promise<string> {
    const nowSec = Math.floor(this.now() / 1000);
    if (this.token && this.token.exp - 60 > nowSec) return this.token.value;
    const assertion = buildServiceAccountAssertion(this.cfg, nowSec);
    const res = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`google token exchange failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, exp: nowSec + (j.expires_in ?? 3600) };
    return this.token.value;
  }

  private base(): string {
    return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.cfg.calendarId ?? 'primary')}/events`;
  }

  private async call(method: string, url: string, body?: unknown): Promise<Record<string, unknown> | null> {
    const token = await this.accessToken();
    const res = await this.fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`google calendar ${method} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as Record<string, unknown>;
  }

  private static toEvent(j: Record<string, unknown>): CalendarEvent {
    const meetUrl = (j.hangoutLink as string | undefined)
      ?? ((j.conferenceData as { entryPoints?: { uri?: string; entryPointType?: string }[] } | undefined)?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri);
    if (!meetUrl) throw new Error('google calendar event has no Meet link (is Meet enabled for the impersonated user?)');
    return { provider: 'google', eventId: String(j.id), meetUrl, htmlLink: j.htmlLink as string | undefined };
  }

  private static body(input: Partial<CalendarEventInput>) {
    const out: Record<string, unknown> = {};
    if (input.summary !== undefined) out.summary = input.summary;
    if (input.description !== undefined) out.description = input.description;
    if (input.startsAt !== undefined && input.durationMin !== undefined) {
      const start = new Date(input.startsAt);
      out.start = { dateTime: start.toISOString() };
      out.end = { dateTime: new Date(start.getTime() + input.durationMin * 60_000).toISOString() };
    }
    if (input.attendees !== undefined) out.attendees = input.attendees.map((email) => ({ email }));
    return out;
  }

  async create(input: CalendarEventInput): Promise<CalendarEvent> {
    const j = await this.call('POST', `${this.base()}?conferenceDataVersion=1&sendUpdates=all`, {
      ...GoogleCalendarProvider.body(input),
      conferenceData: { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: true },
    });
    return GoogleCalendarProvider.toEvent(j ?? {});
  }

  async update(eventId: string, patch: Partial<CalendarEventInput>): Promise<CalendarEvent> {
    const j = await this.call('PATCH', `${this.base()}/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`, GoogleCalendarProvider.body(patch));
    return GoogleCalendarProvider.toEvent(j ?? {});
  }

  async cancel(eventId: string): Promise<void> {
    await this.call('DELETE', `${this.base()}/${encodeURIComponent(eventId)}?sendUpdates=all`);
  }
}

// ── Selection ─────────────────────────────────────────────────────────────────────
let cached: CalendarProvider | null = null;

/**
 * The configured provider. `CALENDAR_PROVIDER=stub` (default) needs nothing. `google` needs
 * GOOGLE_SA_JSON + GOOGLE_CALENDAR_IMPERSONATE in the secrets blob — if they are missing we
 * FAIL LOUDLY (503) rather than silently minting placeholder links in prod.
 */
export async function getCalendarProvider(): Promise<CalendarProvider> {
  if (cached) return cached;
  if (getEnv().CALENDAR_PROVIDER !== 'google') {
    cached = new StubCalendarProvider();
    return cached;
  }
  const raw = await getSecret('GOOGLE_SA_JSON');
  const impersonate = await getSecret('GOOGLE_CALENDAR_IMPERSONATE');
  if (!raw || !impersonate) {
    logger.error('CALENDAR_PROVIDER=google but GOOGLE_SA_JSON / GOOGLE_CALENDAR_IMPERSONATE are not in the secrets blob');
    throw ServiceUnavailableError('Calendar integration is not configured.');
  }
  let sa: { client_email?: string; private_key?: string };
  try { sa = JSON.parse(raw) as typeof sa; } catch { throw ServiceUnavailableError('GOOGLE_SA_JSON is not valid JSON.'); }
  if (!sa.client_email || !sa.private_key) throw ServiceUnavailableError('GOOGLE_SA_JSON is missing client_email/private_key.');
  cached = new GoogleCalendarProvider({ clientEmail: sa.client_email, privateKey: sa.private_key, impersonate, calendarId: await getSecret('GOOGLE_CALENDAR_ID') });
  return cached;
}

/** Test/reconfig hook. */
export function resetCalendarProvider(p?: CalendarProvider): void {
  cached = p ?? null;
}
