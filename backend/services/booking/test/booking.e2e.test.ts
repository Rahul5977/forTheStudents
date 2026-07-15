// Integration test: the whole booking app (routes → saga → repo → DynamoDB Local).
// Seeds an APPROVED mentor with open slots, then walks the booking↔payment saga
// and the session lifecycle.
import { beforeAll, describe, expect, it } from 'vitest';
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key } from '@sc/shared';
import { app } from '../src/app';
import { ensureBookingsTable } from '../src/dev/local-table';
import { ensureMentorsTable } from '../../marketplace/src/dev/local-table';

const MENTORS = process.env.TABLE_MENTORS!;
const BOOKINGS = process.env.TABLE_BOOKINGS!;
const MENTOR_ID = 'mentor_x';

const authAs = (sub: string) =>
  ({ event: { requestContext: { authorizer: { jwt: { claims: { sub, email: `${sub}@x.com`, 'custom:role': 'student' } } } } } }) as unknown as Parameters<typeof app.request>[2];
const A = authAs('stud_a');
const B = authAs('stud_b');
const C = authAs('stud_c');
const post = (body?: unknown, headers?: Record<string, string>) => ({ method: 'POST', headers, ...(body ? { body: JSON.stringify(body) } : {}) });

let bookingId = '';
let refundId = '';

beforeAll(async () => {
  await ensureBookingsTable();
  await ensureMentorsTable();
  const nowIso = new Date().toISOString();
  // Seed an approved mentor + two open slots (startsAt = now → inside the join window).
  await ddb.send(new PutCommand({ TableName: MENTORS, Item: { ...key.mentor(MENTOR_ID), userId: MENTOR_ID, name: 'Aarav S', status: 'APPROVED', priceINR: 100 } }));
  await ddb.send(new PutCommand({ TableName: MENTORS, Item: { ...key.mentorAvailability(MENTOR_ID), slots: [
    { id: 's1', startsAt: nowIso, durationMin: 25, open: true },
    { id: 's2', startsAt: nowIso, durationMin: 25, open: true },
  ] } }));
  // Deterministic clean start: clear prior slot holds + idempotency keys so
  // create() doesn't replay a booking from an earlier run.
  for (const s of ['s1', 's2']) await ddb.send(new DeleteCommand({ TableName: BOOKINGS, Key: key.slotHold(MENTOR_ID, s) }));
  for (const k of ['k1', 'k2']) await ddb.send(new DeleteCommand({ TableName: BOOKINGS, Key: key.idempotency('stud_a', k) }));
});

describe('booking-sessions saga (local DynamoDB)', () => {
  it('POST /bookings holds a slot → PENDING_PAYMENT + payment intent', async () => {
    const r = await (await app.request('/bookings', post({ mentorId: MENTOR_ID, slotId: 's1' }, { 'idempotency-key': 'k1' }), A)).json();
    expect(r.booking.status).toBe('PENDING_PAYMENT');
    expect(r.booking.priceINR).toBe(100);
    expect(r.payment.amountINR).toBe(100);
    bookingId = r.booking.id;
  });

  it('same Idempotency-Key replays the same booking (no new hold)', async () => {
    const r = await (await app.request('/bookings', post({ mentorId: MENTOR_ID, slotId: 's1' }, { 'idempotency-key': 'k1' }), A)).json();
    expect(r.booking.id).toBe(bookingId);
  });

  it('a different student cannot double-book the held slot (409)', async () => {
    const res = await app.request('/bookings', post({ mentorId: MENTOR_ID, slotId: 's1' }), B);
    expect(res.status).toBe(409);
  });

  it('payment webhook (captured) confirms the booking + mints a shared meeting link', async () => {
    const r = await (await app.request('/payments/webhook', post({ bookingId, providerPaymentId: 'pay_1', event: 'payment.captured' }), authAs('anon'))).json();
    expect(r.status).toBe('CONFIRMED');
    expect(r.meetingUrl).toContain('meet.google.com');
  });

  it('BOTH student and mentor see the same meeting link in GET /sessions', async () => {
    const mentorAuth = authAs(MENTOR_ID);
    const studentUrl = (await (await app.request('/sessions', {}, A)).json()).sessions.find((s: { id: string }) => s.id === bookingId)?.meetingUrl;
    const mentorUrl = (await (await app.request('/sessions', {}, mentorAuth)).json()).sessions.find((s: { id: string }) => s.id === bookingId)?.meetingUrl;
    expect(studentUrl).toBeTruthy();
    expect(studentUrl).toBe(mentorUrl); // one shared room
  });

  it('a replayed webhook is a no-op (exactly-once ledger)', async () => {
    const r = await (await app.request('/payments/webhook', post({ bookingId, providerPaymentId: 'pay_1', event: 'payment.captured' }), authAs('anon'))).json();
    expect(r.status).toBe('CONFIRMED');
    const detail = await (await app.request(`/bookings/${bookingId}`, {}, A)).json();
    const captures = detail.ledger.filter((l: { type: string }) => l.type === 'payment.captured');
    expect(captures).toHaveLength(1); // not doubled
    expect(detail.ledger.some((l: { type: string }) => l.type === 'order.created')).toBe(true);
  });

  it('join returns the meeting link + moves to LIVE; non-participants are 403', async () => {
    const r = await (await app.request(`/sessions/${bookingId}/join`, post(), A)).json();
    expect(r.meetingUrl).toContain('meet.google.com');
    expect(r.role).toBe('guest'); // A is the student
    const forbidden = await app.request(`/sessions/${bookingId}/join`, post(), C);
    expect(forbidden.status).toBe(403);
  });

  it('end → ENDED, then rate → RATED', async () => {
    const ended = await (await app.request(`/sessions/${bookingId}/end`, post(), A)).json();
    expect(ended.status).toBe('ENDED');
    const rated = await (await app.request(`/sessions/${bookingId}/rate`, post({ rating: 5, comment: 'Great!' }), A)).json();
    expect(rated.status).toBe('RATED');
    expect(rated.rating).toBe(5);
  });

  it('cannot rate before the session has ended', async () => {
    // fresh booking on s2, confirm it, then try to rate while CONFIRMED
    const created = await (await app.request('/bookings', post({ mentorId: MENTOR_ID, slotId: 's2' }, { 'idempotency-key': 'k2' }), A)).json();
    refundId = created.booking.id;
    await app.request('/payments/webhook', post({ bookingId: refundId, providerPaymentId: 'pay_2', event: 'payment.captured' }), authAs('anon'));
    const res = await app.request(`/sessions/${refundId}/rate`, post({ rating: 4 }), A);
    expect(res.status).toBe(409); // CONFIRMED, not ENDED
  });

  it('cancelling a CONFIRMED booking refunds it', async () => {
    const r = await (await app.request(`/bookings/${refundId}/cancel`, post(), A)).json();
    expect(r.status).toBe('REFUNDED');
    const detail = await (await app.request(`/bookings/${refundId}`, {}, A)).json();
    expect(detail.ledger.some((l: { type: string }) => l.type === 'refund.issued')).toBe(true);
  });

  it('GET /sessions lists my bookings', async () => {
    const r = await (await app.request('/sessions', {}, A)).json();
    expect(r.sessions.length).toBeGreaterThanOrEqual(2);
    expect(r.sessions.find((s: { id: string }) => s.id === bookingId)).toBeTruthy();
  });
});
