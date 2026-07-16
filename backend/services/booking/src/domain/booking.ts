// The booking ↔ payment saga + session lifecycle.
//   POST /bookings        → hold slot, PENDING_PAYMENT, ledger order.created
//   payment webhook        → ledger payment.captured (exactly-once) → CONFIRMED
//   join                   → assert window+paid+participant → mint video token (stub)
//   end / rate             → ENDED → RATED
// Razorpay + the SFU are boilerplate/interfaces only (secrets never touch us) — see
// the `// TODO(owner)` markers. The state machine + ledger are real and tested.
import {
  NotFoundError, ValidationError, ConflictError, ForbiddenError, newId, publish, createLogger, type Principal,
} from '@sc/shared';
import { bookingsRepo, type Booking } from '../repo/bookings.repo';
import { getMentor, getSlot } from '../repo/mentor.reader';
import { createMeeting } from './meeting';
import { createOrder, createRefund, razorpayKeyId } from '../repo/razorpay';
import type { CreateBooking, Webhook, Rate } from '../types';

const logger = createLogger('booking');

const HOLD_MIN = 15;         // unpaid holds expire after this
const JOIN_EARLY_MIN = 15;   // you can join this early
const nowIso = () => new Date().toISOString();
const nowSec = () => Math.floor(Date.now() / 1000);

function assertParticipant(b: Booking, userId: string) {
  if (b.studentId !== userId && b.mentorId !== userId) throw ForbiddenError('Not your session.');
}

// ── Create (student holds a slot) ───────────────────────────────────────────────
export async function createBooking(p: Principal, input: CreateBooking, idempKey?: string) {
  if (input.mentorId === p.userId) throw ValidationError('You cannot book yourself.');

  if (idempKey) {
    const prior = await bookingsRepo.getIdempotent(p.userId, idempKey);
    if (prior) { const b = await bookingsRepo.get(prior); if (b) return paymentView(b); }
  }

  const mentor = await getMentor(input.mentorId);
  if (!mentor || mentor.status !== 'APPROVED') throw NotFoundError('Mentor not available.');
  const slot = await getSlot(input.mentorId, input.slotId);
  if (!slot) throw NotFoundError('Slot not found.');
  if (!slot.open) throw ConflictError('That slot is not open.');

  const holdTtl = nowSec() + HOLD_MIN * 60;
  const booking: Booking = {
    id: newId('bk'), studentId: p.userId, mentorId: input.mentorId, mentorName: mentor.name,
    slotId: input.slotId, startsAt: slot.startsAt, durationMin: slot.durationMin, priceINR: mentor.priceINR,
    status: 'PENDING_PAYMENT', createdAt: nowIso(), updatedAt: nowIso(),
  };
  // Create the Razorpay order up front (receipt = booking id). Returns null when
  // keys aren't configured → the client falls back to the dev-payment path.
  const order = await createOrder(booking.priceINR, booking.id).catch((e) => {
    logger.error('razorpay order failed', { bookingId: booking.id, err: String(e) });
    return null;
  });
  if (order) booking.razorpayOrderId = order.id;

  const res = await bookingsRepo.createWithHold(booking, holdTtl, idempKey);
  if ('duplicate' in res) { const b = await bookingsRepo.get(res.duplicate); if (b) return paymentView(b); }
  if (order) await bookingsRepo.putOrderMapping(order.id, booking.id, holdTtl);

  await bookingsRepo.appendLedger(booking.id, `order-${booking.id}`, { type: 'order.created', amountINR: booking.priceINR });
  await publish({ type: 'booking.created', source: 'booking', detail: { bookingId: booking.id, mentorId: booking.mentorId } });
  return paymentView(booking);
}

/** Shape returned to the client: the booking + a Razorpay payment intent. */
async function paymentView(b: Booking) {
  return {
    booking: b,
    payment: {
      provider: 'razorpay',
      amountINR: b.priceINR,
      orderId: b.razorpayOrderId ?? null,        // client opens Checkout with this + keyId
      keyId: (await razorpayKeyId()) ?? null,    // public Key ID (safe for the browser)
      note: b.razorpayOrderId
        ? 'Open Razorpay Checkout with { key: keyId, order_id: orderId }.'
        : (b.status === 'PENDING_PAYMENT' ? 'Razorpay not configured — the dev-pay path applies.' : 'Already paid.'),
    },
  };
}

// ── Payment webhook (saga completion) ───────────────────────────────────────────
// The HTTP handler verifies the Razorpay signature + maps the payload to this
// normalized shape (see handleRazorpayEvent) before calling us.
export async function handleWebhook(input: Webhook) {
  const b = await bookingsRepo.get(input.bookingId);
  if (!b) throw NotFoundError('Booking not found.');

  if (input.event === 'payment.failed') {
    const wrote = await bookingsRepo.appendLedger(b.id, input.providerPaymentId, { type: 'payment.failed', providerPaymentId: input.providerPaymentId });
    if (wrote && b.status === 'PENDING_PAYMENT') {
      await bookingsRepo.transition(b.id, ['PENDING_PAYMENT'], 'EXPIRED').catch(() => {});
      await bookingsRepo.releaseHold(b.mentorId, b.slotId);
    }
    return { status: 'EXPIRED', bookingId: b.id };
  }

  // payment.captured — exactly-once via the ledger guard on providerPaymentId.
  const wrote = await bookingsRepo.appendLedger(b.id, input.providerPaymentId, { type: 'payment.captured', amountINR: b.priceINR, providerPaymentId: input.providerPaymentId });
  if (!wrote) return { status: (await bookingsRepo.get(b.id))!.status, bookingId: b.id }; // replayed webhook — no-op

  if (b.status === 'PENDING_PAYMENT') {
    // Generate the shared meeting link NOW (post-payment) so both sides see it.
    const meeting = createMeeting(b.id);
    const confirmed = await bookingsRepo.transition(b.id, ['PENDING_PAYMENT'], 'CONFIRMED', {
      meetingUrl: meeting.url, meetingProvider: meeting.provider,
      razorpayPaymentId: input.providerPaymentId, // kept for refunds
    });
    await publish({ type: 'payment.succeeded', source: 'booking', detail: { bookingId: b.id, amountINR: b.priceINR } });
    await publish({ type: 'booking.confirmed', source: 'booking', detail: { bookingId: b.id, studentId: b.studentId, mentorId: b.mentorId, meetingUrl: meeting.url } });
    return { status: confirmed.status, bookingId: b.id, meetingUrl: meeting.url };
  }
  return { status: b.status, bookingId: b.id, meetingUrl: b.meetingUrl };
}

// ── Cancel / refund ─────────────────────────────────────────────────────────────
export async function cancel(p: Principal, id: string) {
  const b = await bookingsRepo.get(id);
  if (!b) throw NotFoundError('Booking not found.');
  if (b.studentId !== p.userId) throw ForbiddenError('Only the booker can cancel.');

  if (b.status === 'PENDING_PAYMENT') {
    const out = await bookingsRepo.transition(b.id, ['PENDING_PAYMENT'], 'CANCELLED');
    await bookingsRepo.releaseHold(b.mentorId, b.slotId);
    return out;
  }
  if (b.status === 'CONFIRMED') {
    // Issue the real Razorpay refund (no-op/null if keys aren't configured or it was a dev pay).
    let refundId: string | undefined;
    if (b.razorpayPaymentId) {
      const refund = await createRefund(b.razorpayPaymentId).catch((e) => {
        logger.error('razorpay refund failed', { bookingId: b.id, err: String(e) });
        return null;
      });
      refundId = refund?.id;
    }
    const out = await bookingsRepo.transition(b.id, ['CONFIRMED'], 'REFUNDED');
    await bookingsRepo.appendLedger(b.id, `refund-${b.id}`, { type: 'refund.issued', amountINR: b.priceINR, refundId });
    await bookingsRepo.releaseHold(b.mentorId, b.slotId);
    await publish({ type: 'refund.issued', source: 'booking', detail: { bookingId: b.id, studentId: b.studentId, refundId } });
    return out;
  }
  throw ConflictError(`Cannot cancel a ${b.status} session.`);
}

// ── Razorpay webhook payload → normalized event → the saga ───────────────────────
/**
 * Map a verified Razorpay webhook body to the normalized {bookingId, providerPaymentId,
 * event} shape and run the saga. Resolves the booking via the order→booking mapping.
 */
export async function handleRazorpayEvent(evt: unknown) {
  const e = evt as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; notes?: { bookingId?: string } } } } };
  const type = e?.event;
  const entity = e?.payload?.payment?.entity;
  if (!type || !entity?.id) return { ignored: true, reason: 'no payment entity' };
  if (type !== 'payment.captured' && type !== 'payment.failed') return { ignored: true, reason: `unhandled event ${type}` };

  const bookingId = (entity.order_id ? await bookingsRepo.getBookingIdByOrder(entity.order_id) : null) ?? entity.notes?.bookingId;
  if (!bookingId) return { ignored: true, reason: 'unknown order' };

  return handleWebhook({ bookingId, providerPaymentId: entity.id, event: type });
}

// ── Sessions ─────────────────────────────────────────────────────────────────────
export async function listSessions(p: Principal) {
  const [asStudent, asMentor] = await Promise.all([
    bookingsRepo.listByGsi('gsi1-student', `USER#${p.userId}`),
    bookingsRepo.listByGsi('gsi2-mentor', `MENTOR#${p.userId}`),
  ]);
  const byId = new Map<string, Booking>();
  for (const b of [...asStudent, ...asMentor]) byId.set(b.id, b);
  return { sessions: [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

export async function getBooking(p: Principal, id: string) {
  const b = await bookingsRepo.get(id);
  if (!b) throw NotFoundError('Booking not found.');
  assertParticipant(b, p.userId);
  const payment = b.status === 'PENDING_PAYMENT'
    ? { provider: 'razorpay', amountINR: b.priceINR, orderId: b.razorpayOrderId ?? null, keyId: (await razorpayKeyId()) ?? null }
    : null;
  return { booking: b, ledger: await bookingsRepo.ledger(id), payment };
}

export async function join(p: Principal, id: string) {
  const b = await bookingsRepo.get(id);
  if (!b) throw NotFoundError('Booking not found.');
  assertParticipant(b, p.userId);
  if (b.status !== 'CONFIRMED' && b.status !== 'LIVE') throw ConflictError(`Session is ${b.status} — cannot join.`);

  const starts = new Date(b.startsAt).getTime();
  const now = Date.now();
  if (now < starts - JOIN_EARLY_MIN * 60_000) throw ConflictError('Too early — you can join 15 min before the start.');
  if (now > starts + (b.durationMin + 5) * 60_000) throw ConflictError('This session window has passed.');

  // The shared Google Meet link was created at payment confirmation — the same URL
  // for both student and mentor. (TODO(owner): real Google Calendar link — see meeting.ts.)
  const meetingUrl = b.meetingUrl ?? createMeeting(b.id).url;
  const updated = b.status === 'CONFIRMED' ? await bookingsRepo.transition(b.id, ['CONFIRMED'], 'LIVE', { meetingUrl }) : b;
  return { meetingUrl, meetingProvider: b.meetingProvider ?? 'stub', role: b.mentorId === p.userId ? 'host' : 'guest', startsAt: updated.startsAt };
}

export async function endSession(p: Principal, id: string) {
  const b = await bookingsRepo.get(id);
  if (!b) throw NotFoundError('Booking not found.');
  assertParticipant(b, p.userId);
  // TODO(owner): in prod this is driven by the SFU `session.ended` webhook + recording.ready → S3.
  const out = await bookingsRepo.transition(b.id, ['LIVE', 'CONFIRMED'], 'ENDED');
  await publish({ type: 'session.ended', source: 'booking', detail: { bookingId: b.id } });
  return out;
}

export async function rate(p: Principal, id: string, input: Rate) {
  const b = await bookingsRepo.get(id);
  if (!b) throw NotFoundError('Booking not found.');
  if (b.studentId !== p.userId) throw ForbiddenError('Only the student can rate the session.');
  const out = await bookingsRepo.transition(b.id, ['ENDED'], 'RATED', { rating: input.rating, ratingComment: input.comment });
  // TODO(owner): a notifications/analytics consumer folds session.rated into the mentor's
  // ratingAvg/ratingCount (kept out of the hot path; the mentors table isn't written here).
  await publish({ type: 'session.rated', source: 'booking', detail: { bookingId: b.id, mentorId: b.mentorId, rating: input.rating } });
  return out;
}
