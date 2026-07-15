// Transport DTOs (zod) + the booking state machine for booking-sessions.
import { z } from 'zod';

/**
 * Lifecycle:  PENDING_PAYMENT → CONFIRMED → LIVE → ENDED → RATED
 * Off-ramps:  CANCELLED (pre-pay), REFUNDED (post-pay cancel/no-show), EXPIRED (hold TTL)
 */
export type BookingStatus =
  | 'PENDING_PAYMENT' | 'CONFIRMED' | 'LIVE' | 'ENDED' | 'RATED'
  | 'CANCELLED' | 'REFUNDED' | 'EXPIRED';

/** POST /bookings — hold a mentor's slot (payment follows). Idempotency-Key header dedupes. */
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
