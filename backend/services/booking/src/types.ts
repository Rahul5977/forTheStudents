// Transport DTOs (zod) + the booking state machine for booking-sessions.
import { z } from 'zod';

/**
 * Lifecycle:  REQUESTED → ACCEPTED → CONFIRMED → LIVE → ENDED → RATED
 *   REQUESTED  student requested a slot (held); awaiting the mentor's decision
 *   ACCEPTED   mentor accepted → payment order created; awaiting the student's payment
 *   CONFIRMED  paid → session locked in + Meet link
 * Off-ramps:  DECLINED (mentor rejects), CANCELLED (student, pre-pay),
 *             REFUNDED (post-pay cancel/no-show), EXPIRED (unpaid hold TTL)
 */
export type BookingStatus =
  | 'REQUESTED' | 'ACCEPTED' | 'CONFIRMED' | 'LIVE' | 'ENDED' | 'RATED'
  | 'DECLINED' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED';

/** POST /bookings — REQUEST a mentor's slot (mentor accepts, then payment). Idempotency-Key dedupes. */
export const CreateBookingInput = z.object({
  mentorId: z.string().min(1).max(80),
  slotId: z.string().min(1).max(40),
});

/**
 * POST /payments/webhook — Razorpay-style capture callback.
 * In prod the signature MUST be verified (TODO owner); the body carries the facts.
 */
export const WebhookInput = z.object({
  bookingId: z.string().min(1).max(60),
  providerPaymentId: z.string().min(1).max(80),
  event: z.enum(['payment.captured', 'payment.failed']),
});

/** POST /sessions/:id/rate */
export const RateInput = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(400).optional(),
});

export type CreateBooking = z.infer<typeof CreateBookingInput>;
export type Webhook = z.infer<typeof WebhookInput>;
export type Rate = z.infer<typeof RateInput>;
