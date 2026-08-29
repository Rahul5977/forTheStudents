// Integration test: the whole marketplace app (routes → domain → repo → DynamoDB Local).
// Walks the Phase-11 mentor lifecycle: apply (DRAFT) → verify email → upload documents →
// submit → per-field verification → DOCS_VERIFIED → interview (stub Calendar) → decision →
// public search; plus scope gating, leak checks, availability concurrency and profile locks.
// Domain events are spy-asserted (publish() is a no-op under DynamoDB Local — GROUND TRUTH §11).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

vi.mock('@sc/shared', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@sc/shared')>();
  return { ...mod, publish: vi.fn(async () => {}) };
});

import { ddb, publish, auditRepo, resetCalendarProvider, StubCalendarProvider, REQUIRED_VERIFICATION_FIELDS } from '@sc/shared';
import { app } from '../src/app';
import { ensureMentorsTable, ensureAuditTable } from '../src/dev/local-table';
import { getDocumentStore, MemoryDocumentStore } from '../src/repo/documents.store';

// Phase 11: admins carry permission scopes in the token (`custom:scopes`); the default ADMIN
// has every scope, NOSCOPE is an admin with none (must be 403 on every scoped route).
const ALL_SCOPES = ['mentors.manage','mentors.interview','sessions.view','payments.view','users.view','broadcast.send','content.manage'];
const authAs = (sub: string, role = 'student', scopes: string[] = role === 'admin' ? ALL_SCOPES : []) =>
  ({ event: { requestContext: { authorizer: { jwt: { claims: { sub, email: `${sub}@x.com`, 'custom:role': role, 'custom:scopes': scopes.join(',') } } } } } }) as unknown as Parameters<typeof app.request>[2];

const M = authAs('mentor_1');
const M2 = authAs('mentor_2');
const ADMIN = authAs('admin_1', 'admin');
const NOSCOPE = authAs('admin_noscope', 'admin', []);
const SUPER = authAs('super_1', 'superadmin', []);
const jpost = (body?: unknown) => ({ method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
const jput = (body: unknown) => ({ method: 'PUT', body: JSON.stringify(body) });
const jpatch = (body: unknown) => ({ method: 'PATCH', body: JSON.stringify(body) });

const calendar = new StubCalendarProvider();
const eventTypes = () => vi.mocked(publish).mock.calls.map((c) => (c[0] as { type: string }).type);

beforeAll(async () => {
  await ensureMentorsTable();
  await ensureAuditTable();
  resetCalendarProvider(calendar);
  for (const sub of ['mentor_1', 'mentor_2']) {
    for (const sk of ['PROFILE', 'AVAILABILITY', 'EMAILOTP']) {
      await ddb.send(new DeleteCommand({ TableName: process.env.TABLE_MENTORS!, Key: { PK: `MENTOR#${sub}`, SK: sk } }));
    }
    await ddb.send(new DeleteCommand({ TableName: process.env.TABLE_MENTORS!, Key: { PK: `EMAILRL#user:${sub}`, SK: 'RL' } }));
    await ddb.send(new DeleteCommand({ TableName: process.env.TABLE_MENTORS!, Key: { PK: `EMAILRL#presign:${sub}`, SK: 'RL' } }));
  }
  for (const email of ['aarav@iitb.ac.in', 'diya@iitd.ac.in']) await ddb.send(new DeleteCommand({ TableName: process.env.TABLE_MENTORS!, Key: { PK: `EMAILRL#${email}`, SK: 'RL' } }));
});

const ESSAY = 'I went through JoSAA counselling two years ago with very little guidance and made avoidable mistakes in my choice order. I want to help juniors avoid that.';
const APPLY = { name: 'Aarav S', college: 'IIT Bombay', branch: 'Computer Science', year: 3, bio: 'CSE senior who loves teaching juniors.', topics: ['CSE vs ECE', 'Placements'], priceINR: 100 };
const FULL = {
  ...APPLY, gradYear: 2027, rollNumber: '21B0123', phone: '9876543210', languages: ['English', 'Hindi'], jeeRank: 812, jeeYear: 2023,
  essays: { why: ESSAY, how: ESSAY }, consent: { accepted: true as const, version: '2026-08' },
};

/** Drive a mentor to PENDING_REVIEW (used for the second applicant). */
async function submitFull(auth: Parameters<typeof app.request>[2], email: string, name: string) {
  await app.request('/mentor/apply', jpost({ ...FULL, name }), auth);
  const otp = await (await app.request('/mentor/verify/email', jpost({ email }), auth)).json();
  await app.request('/mentor/verify/email', jpost({ email, code: otp.devOtp }), auth);
  const pre = await (await app.request('/mentor/documents/presign', jpost({ docType: 'id_card', contentType: 'image/jpeg', sizeBytes: 120_000 }), auth)).json();
  (getDocumentStore() as MemoryDocumentStore).setSize(pre.key, 120_000);
  await app.request('/mentor/documents/confirm', jpost({ key: pre.key }), auth);
  return (await app.request('/mentor/submit', jpost(), auth)).json();
}

let idKey = '';

describe('marketplace-mentors (local DynamoDB)', () => {
  it('apply creates a DRAFT with a completeness report', async () => {
    const r = await (await app.request('/mentor/apply', jpost(APPLY), M)).json();
    expect(r.status).toBe('DRAFT');
    expect(r.emailVerified).toBe(false);
    expect(r.college).toBe('IIT Bombay');
    expect(r.completeness.complete).toBe(false);
    expect(r.completeness.missing.map((m: { field: string }) => m.field)).toContain('essayWhy');
    expect(eventTypes()).toContain('mentor.applied');
  });

  it('rejects a non-.ac.in email', async () => {
    expect((await app.request('/mentor/verify/email', jpost({ email: 'aarav@gmail.com' }), M)).status).toBe(400);
  });

  it('email OTP: request returns devOtp (non-prod), wrong code 400, right code verifies', async () => {
    const req = await (await app.request('/mentor/verify/email', jpost({ email: 'aarav@iitb.ac.in' }), M)).json();
    expect(req.sent).toBe(true);
    expect(req.devOtp).toMatch(/^\d{6}$/);
    expect((await app.request('/mentor/verify/email', jpost({ email: 'aarav@iitb.ac.in', code: '000000' }), M)).status).toBe(400);
    const ok = await (await app.request('/mentor/verify/email', jpost({ email: 'aarav@iitb.ac.in', code: req.devOtp }), M)).json();
    expect(ok.verified).toBe(true);
    expect(ok.mentor.emailVerified).toBe(true);
    expect(ok.mentor.status).toBe('DRAFT');
  });

  it('presign rejects a bad content-type and an oversized file (400)', async () => {
    expect((await app.request('/mentor/documents/presign', jpost({ docType: 'id_card', contentType: 'text/html', sizeBytes: 10 }), M)).status).toBe(400);
    expect((await app.request('/mentor/documents/presign', jpost({ docType: 'id_card', contentType: 'image/png', sizeBytes: 6 * 1024 * 1024 }), M)).status).toBe(400);
  });

  it('presign mints a server-owned key under mentors/<userId>/; confirm records the document; another mentor cannot confirm it', async () => {
    const pre = await (await app.request('/mentor/documents/presign', jpost({ docType: 'id_card', contentType: 'image/jpeg', sizeBytes: 120_000 }), M)).json();
    expect(pre.key).toMatch(/^mentors\/mentor_1\/id_card\/[0-9A-Z]+\.jpg$/);
    expect(pre.method).toBe('PUT');
    expect(pre.headers['content-type']).toBe('image/jpeg');
    idKey = pre.key;
    // Unknown key → 400 (never uploaded).
    expect((await app.request('/mentor/documents/confirm', jpost({ key: 'mentors/mentor_1/id_card/NOPE.jpg' }), M)).status).toBe(400);
    // Another mentor's key → 403 even though the object exists.
    await app.request('/mentor/apply', jpost({ ...APPLY, name: 'Diya K' }), M2);
    expect((await app.request('/mentor/documents/confirm', jpost({ key: idKey }), M2)).status).toBe(403);
    (getDocumentStore() as MemoryDocumentStore).setSize(idKey, 120_000);
    const ok = await (await app.request('/mentor/documents/confirm', jpost({ key: idKey }), M)).json();
    expect(ok.docType).toBe('id_card');
    expect(ok.mentor.documents.id_card.sizeBytes).toBe(120_000);
    expect(ok.mentor.documents.id_card.key).toBeUndefined(); // the key never leaves the server
    expect(ok.mentor.idVerified).toBe(true);
  });

  it('an oversized upload is rejected at confirm (and removed)', async () => {
    const pre = await (await app.request('/mentor/documents/presign', jpost({ docType: 'supporting', contentType: 'application/pdf', sizeBytes: 100 }), M)).json();
    (getDocumentStore() as MemoryDocumentStore).setSize(pre.key, 9 * 1024 * 1024);
    const res = await app.request('/mentor/documents/confirm', jpost({ key: pre.key }), M);
    expect(res.status).toBe(400);
    expect(await getDocumentStore().head(pre.key)).toBeNull();
  });

  it('submit names EVERY missing item, not just the first', async () => {
    const res = await app.request('/mentor/submit', jpost(), M);
    expect(res.status).toBe(400);
    const body = await res.json();
    const fields = body.error.details.missing.map((m: { field: string }) => m.field);
    expect(fields).toEqual(expect.arrayContaining(['gradYear', 'rollNumber', 'phone', 'jeeRank', 'jeeYear', 'essayWhy', 'essayHow', 'consent']));
    expect(fields).not.toContain('collegeEmail'); // verified earlier
    expect(fields).not.toContain('doc_id_card');  // uploaded earlier
    expect(fields.length).toBeGreaterThanOrEqual(8);
  });

  it('a complete application submits → PENDING_REVIEW with every field UNVERIFIED + consent timestamped', async () => {
    const saved = await (await app.request('/mentor/apply', jpost(FULL), M)).json();
    expect(saved.consent.version).toBe('2026-08');
    expect(saved.consent.acceptedAt).toBeTruthy();
    expect(saved.completeness.complete).toBe(true);
    const r = await (await app.request('/mentor/submit', jpost(), M)).json();
    expect(r.status).toBe('PENDING_REVIEW');
    expect(r.submittedAt).toBeTruthy();
    expect(Object.keys(r.fields)).toEqual(expect.arrayContaining([...REQUIRED_VERIFICATION_FIELDS]));
    expect(r.fields.doc_id_card.status).toBe('UNVERIFIED');
    expect(eventTypes()).toContain('mentor.verification.submitted');
    // Editing a submitted application is a 409.
    expect((await app.request('/mentor/apply', jpost(FULL), M)).status).toBe(409);
  });

  it('a pending mentor is NOT yet in public search', async () => {
    const r = await (await app.request('/mentors', {}, authAs('anon'))).json();
    expect(r.mentors.find((m: { userId: string }) => m.userId === 'mentor_1')).toBeUndefined();
  });

  it('queue is scope-gated (student 403 · unscoped admin 403 · superadmin 200) and time-ordered with counts', async () => {
    expect((await app.request('/admin/mentors?status=PENDING_REVIEW', {}, M)).status).toBe(403);
    expect((await app.request('/admin/mentors?status=PENDING_REVIEW', {}, NOSCOPE)).status).toBe(403);
    const q = await (await app.request('/admin/mentors?status=PENDING_REVIEW&limit=50', {}, SUPER)).json();
    const me = q.items.find((m: { userId: string }) => m.userId === 'mentor_1');
    expect(me).toBeTruthy();
    expect(me.essays.why).toBe(ESSAY);          // admins see everything…
    expect(me.documents.id_card.key).toBeUndefined(); // …except raw storage keys
    expect(me.progress.verified).toBe(0);
    expect(me.legalActions.approve).toBe(false);
    const counts = await (await app.request('/admin/mentors/counts', {}, ADMIN)).json();
    expect(counts.PENDING_REVIEW).toBeGreaterThanOrEqual(1);
    // Legacy flat queue still answers (deployed console).
    const legacy = await (await app.request('/admin/mentors/pending', {}, ADMIN)).json();
    expect(legacy.find((m: { userId: string }) => m.userId === 'mentor_1')).toBeTruthy();
    // Text filter + cursor shape.
    const filtered = await (await app.request('/admin/mentors?status=PENDING_REVIEW&q=bombay', {}, ADMIN)).json();
    expect(filtered.items.every((m: { college: string }) => /bombay/i.test(m.college))).toBe(true);
    expect('nextCursor' in filtered).toBe(true);
  });

  it('illegal transitions are 409: approve from PENDING_REVIEW, verify-docs before every field is VERIFIED, interview before DOCS_VERIFIED', async () => {
    expect((await app.request('/admin/mentors/mentor_1/review', jpost({ decision: 'approve' }), ADMIN)).status).toBe(409);
    expect((await app.request('/admin/mentors/mentor_1/verify-docs', jpost(), ADMIN)).status).toBe(409);
    expect((await app.request('/admin/mentors/mentor_1/interview', jpost({ interviewAt: '2026-09-10T10:00:00.000Z' }), ADMIN)).status).toBe(409);
  });

  it('per-field verification: every required field VERIFIED → verify-docs → DOCS_VERIFIED; a FLAG drops it back; re-verify restores', async () => {
    for (const f of REQUIRED_VERIFICATION_FIELDS) {
      const r = await (await app.request(`/admin/mentors/mentor_1/fields/${f}`, jpost({ status: 'VERIFIED' }), ADMIN)).json();
      expect(r.fields[f].status).toBe('VERIFIED');
      expect(r.fields[f].by).toBe('admin_1');
    }
    expect((await app.request('/admin/mentors/mentor_1/fields/bogus', jpost({ status: 'VERIFIED' }), ADMIN)).status).toBe(400);
    const dv = await (await app.request('/admin/mentors/mentor_1/verify-docs', jpost(), ADMIN)).json();
    expect(dv.status).toBe('DOCS_VERIFIED');
    expect(dv.docsVerifiedAt).toBeTruthy();
    expect(dv.legalActions.scheduleInterview).toBe(true);
    // Flag the ID card after docs-verified → back to PENDING_REVIEW (legal edge).
    const flagged = await (await app.request('/admin/mentors/mentor_1/fields/doc_id_card', jpost({ status: 'FLAGGED', note: 'photo unreadable' }), ADMIN)).json();
    expect(flagged.status).toBe('PENDING_REVIEW');
    expect(flagged.progress.flagged).toBe(1);
    const again = await (await app.request('/admin/mentors/mentor_1/fields/doc_id_card', jpost({ status: 'VERIFIED' }), ADMIN)).json();
    expect(again.progress.complete).toBe(true);
    expect((await (await app.request('/admin/mentors/mentor_1/verify-docs', jpost(), ADMIN)).json()).status).toBe('DOCS_VERIFIED');
    expect(eventTypes()).toEqual(expect.arrayContaining(['mentor.docs.verified', 'mentor.docs.unverified']));
    const trail = await auditRepo.recent('admin_1', 50);
    expect(trail.some((e) => e.action === 'mentor.field.verify' && e.target === 'mentor_1')).toBe(true);
    expect(trail.some((e) => e.action === 'mentor.docs.verified')).toBe(true);
  });

  it('admin document URL is short-lived and AUDITED; needs mentors.manage', async () => {
    expect((await app.request('/admin/mentors/mentor_1/documents/id_card/url', {}, NOSCOPE)).status).toBe(403);
    const r = await (await app.request('/admin/mentors/mentor_1/documents/id_card/url', {}, ADMIN)).json();
    expect(r.url).toContain('signed');
    expect(r.expiresInSec).toBeLessThanOrEqual(300);
    expect((await auditRepo.recent('admin_1', 5))[0]?.action).toBe('mentor.document.access');
    expect((await app.request('/admin/mentors/mentor_1/documents/supporting/url', {}, ADMIN)).status).toBe(404);
  });

  it('interview: needs mentors.interview; creates ONE Calendar event (idempotent), reschedules the same event, then cancels back to DOCS_VERIFIED', async () => {
    const at = '2026-09-10T10:00:00.000Z';
    expect((await app.request('/admin/mentors/mentor_1/interview', jpost({ interviewAt: at }), authAs('adm_x', 'admin', ['mentors.manage']))).status).toBe(403);
    const r = await (await app.request('/admin/mentors/mentor_1/interview', jpost({ interviewAt: at, note: 'Bring your ID' }), ADMIN)).json();
    expect(r.status).toBe('INTERVIEW_SCHEDULED');
    expect(r.interview.meetUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(r.interview.provider).toBe('stub');
    expect(r.interview.durationMin).toBe(15);
    expect(r.interviewLink).toBe(r.interview.meetUrl); // legacy mirror for the deployed UI
    const before = calendar.events.size;
    const again = await (await app.request('/admin/mentors/mentor_1/interview', jpost({ interviewAt: at }), ADMIN)).json();
    expect(again.interview.eventId).toBe(r.interview.eventId);
    expect(calendar.events.size).toBe(before); // no second event
    expect((await app.request('/admin/mentors/mentor_1/interview', jpost({ interviewAt: '2026-09-11T10:00:00.000Z' }), ADMIN)).status).toBe(409); // use PATCH
    const re = await (await app.request('/admin/mentors/mentor_1/interview', jpatch({ interviewAt: '2026-09-11T10:00:00.000Z', durationMin: 20 }), ADMIN)).json();
    expect(re.interview.eventId).toBe(r.interview.eventId);
    expect(re.interview.interviewAt).toBe('2026-09-11T10:00:00.000Z');
    expect(calendar.events.get(r.interview.eventId)?.startsAt).toBe('2026-09-11T10:00:00.000Z');
    // Field edits are frozen during an interview.
    expect((await app.request('/admin/mentors/mentor_1/fields/phone', jpost({ status: 'FLAGGED' }), ADMIN)).status).toBe(409);
    const cancelled = await (await app.request('/admin/mentors/mentor_1/interview', { method: 'DELETE' }, ADMIN)).json();
    expect(cancelled.status).toBe('DOCS_VERIFIED');
    expect(cancelled.interview).toBeUndefined();
    expect(calendar.events.has(r.interview.eventId)).toBe(false);
    expect(eventTypes()).toEqual(expect.arrayContaining(['mentor.interview.scheduled', 'mentor.interview.rescheduled', 'mentor.interview.cancelled']));
  });

  it('legacy interview shape { interviewLink } is honoured without a Calendar event', async () => {
    const before = calendar.events.size;
    const r = await (await app.request('/admin/mentors/mentor_1/interview', jpost({ interviewAt: '2026-09-12T10:00:00.000Z', interviewLink: 'https://meet.google.com/abc-defg-hij' }), ADMIN)).json();
    expect(r.interview.provider).toBe('external');
    expect(r.interview.meetUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(calendar.events.size).toBe(before);
  });

  it('a rejection without a reason is 400; approve after the interview → APPROVED with history', async () => {
    expect((await app.request('/admin/mentors/mentor_1/review', jpost({ decision: 'reject' }), ADMIN)).status).toBe(400);
    expect((await app.request('/admin/mentors/mentor_1/review', jpost({ decision: 'approve' }), NOSCOPE)).status).toBe(403);
    const r = await (await app.request('/admin/mentors/mentor_1/review', jpost({ decision: 'approve', note: 'Great interview' }), ADMIN)).json();
    expect(r.status).toBe('APPROVED');
    expect(r.history.map((h: { to: string }) => h.to)).toEqual(['PENDING_REVIEW', 'DOCS_VERIFIED', 'PENDING_REVIEW', 'DOCS_VERIFIED', 'INTERVIEW_SCHEDULED', 'DOCS_VERIFIED', 'INTERVIEW_SCHEDULED', 'APPROVED']);
    expect(eventTypes()).toContain('mentor.approved');
  });

  it('approved mentor appears in public search WITHOUT leaking any private field', async () => {
    const r = await (await app.request('/mentors?college=bombay', {}, authAs('anon'))).json();
    const m = r.mentors.find((x: { userId: string }) => x.userId === 'mentor_1');
    expect(m).toBeTruthy();
    for (const k of ['email', 'emailVerified', 'phone', 'rollNumber', 'essays', 'documents', 'fields', 'reviewNote', 'rejection', 'interview', 'history', 'consent', 'jeeRank']) {
      expect(m[k], k).toBeUndefined();
    }
    expect(m.topics).toContain('Placements');
    expect(m.languages).toEqual(['English', 'Hindi']);
  });

  it('search filters by branch + maxPrice', async () => {
    expect((await (await app.request('/mentors?branch=computer', {}, authAs('a'))).json()).count).toBeGreaterThanOrEqual(1);
    expect((await (await app.request('/mentors?maxPrice=50', {}, authAs('a'))).json()).count).toBe(0); // price 100 > 50
  });

  it('re-applying after approval is forbidden (locked); price/name are locked on PUT /mentor/profile, bio is not', async () => {
    expect((await app.request('/mentor/apply', jpost(APPLY), M)).status).toBe(403);
    expect((await app.request('/mentor/profile', jput({ priceINR: 150 }), M)).status).toBe(400);
    expect((await app.request('/mentor/profile', jput({ name: 'Someone Else' }), M)).status).toBe(400);
    const r = await (await app.request('/mentor/profile', jput({ bio: 'Updated bio for juniors.', languages: ['English'] }), M)).json();
    expect(r.bio).toBe('Updated bio for juniors.');
    expect(r.priceINR).toBe(100);
  });

  it('availability round-trips with optimistic concurrency (409 on stale)', async () => {
    const slots = [{ id: 's1', startsAt: '2026-10-20T10:00:00.000Z', durationMin: 25, open: true }];
    const put = await (await app.request('/mentor/availability', jput({ slots }), M)).json();
    expect(put.version).toBe(1);
    expect(put.slots).toHaveLength(1);
    const stale = await app.request('/mentor/availability', jput({ slots: [], version: 0 }), M);
    expect(stale.status).toBe(409);
  });

  it('soft reject → DRAFT (reason visible, re-submit allowed); hard reject → REJECTED (terminal, apply 403)', async () => {
    const t0 = new Date().toISOString(); // the audit table is append-only and survives test runs
    const sub = await submitFull(M2, 'diya@iitd.ac.in', 'Diya K');
    expect(sub.status).toBe('PENDING_REVIEW');
    const soft = await (await app.request('/admin/mentors/mentor_2/review', jpost({ decision: 'reject', kind: 'soft', note: 'Roll number does not match the ID card.' }), ADMIN)).json();
    expect(soft.status).toBe('DRAFT');
    expect(soft.rejection.kind).toBe('soft');
    const own = await (await app.request('/mentor/profile', {}, M2)).json();
    expect(own.rejection.reason).toMatch(/Roll number/);
    expect(eventTypes()).toContain('mentor.revision_requested');
    // Fix + resubmit.
    await app.request('/mentor/apply', jpost({ ...FULL, name: 'Diya K', rollNumber: '21B0999' }), M2);
    const resub = await (await app.request('/mentor/submit', jpost(), M2)).json();
    expect(resub.status).toBe('PENDING_REVIEW');
    expect(resub.rejection).toBeUndefined();
    const hard = await (await app.request('/admin/mentors/mentor_2/review', jpost({ decision: 'reject', note: 'Not a current student.' }), ADMIN)).json();
    expect(hard.status).toBe('REJECTED');
    expect((await app.request('/mentor/apply', jpost(FULL), M2)).status).toBe(403);
    expect((await app.request('/admin/mentors/mentor_2/review', jpost({ decision: 'approve' }), ADMIN)).status).toBe(409); // terminal
    expect(eventTypes()).toContain('mentor.rejected');
    const trail = await auditRepo.recent('admin_1', 100);
    expect(trail.filter((e) => e.action === 'mentor.review.reject' && e.target === 'mentor_2' && e.at >= t0)).toHaveLength(2);
  });

  it('presign is rate-limited per user (21st request in an hour → 400)', async () => {
    const auth = authAs('mentor_presign_rl');
    await app.request('/mentor/apply', jpost(APPLY), auth);
    await ddb.send(new DeleteCommand({ TableName: process.env.TABLE_MENTORS!, Key: { PK: 'EMAILRL#presign:mentor_presign_rl', SK: 'RL' } }));
    for (let i = 0; i < 20; i++) expect((await app.request('/mentor/documents/presign', jpost({ docType: 'supporting', contentType: 'image/png', sizeBytes: 10 }), auth)).status).toBe(200);
    expect((await app.request('/mentor/documents/presign', jpost({ docType: 'supporting', contentType: 'image/png', sizeBytes: 10 }), auth)).status).toBe(400);
  });

  it('OTP send is rate-limited per user (6th request in an hour → 400)', async () => {
    const auth = authAs('mentor_rl');
    await app.request('/mentor/apply', jpost(APPLY), auth);
    await ddb.send(new DeleteCommand({ TableName: process.env.TABLE_MENTORS!, Key: { PK: 'EMAILRL#user:mentor_rl', SK: 'RL' } }));
    await ddb.send(new DeleteCommand({ TableName: process.env.TABLE_MENTORS!, Key: { PK: 'EMAILRL#rl@iitk.ac.in', SK: 'RL' } }));
    for (let i = 0; i < 5; i++) expect((await app.request('/mentor/verify/email', jpost({ email: 'rl@iitk.ac.in' }), auth)).status).toBe(200);
    expect((await app.request('/mentor/verify/email', jpost({ email: 'rl@iitk.ac.in' }), auth)).status).toBe(400);
  });
});
