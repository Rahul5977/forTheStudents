// Transport DTOs (zod) + shared types for the marketplace-mentors service.
import { z } from 'zod';

/** State machine: DRAFT → PENDING_REVIEW → INTERVIEW → APPROVED|REJECTED (interview optional). */
export type MentorStatus = 'DRAFT' | 'PENDING_REVIEW' | 'INTERVIEW' | 'APPROVED' | 'REJECTED';

const topics = z.array(z.string().min(1).max(40)).max(12);

/** POST /mentor/apply — create/refresh the mentor's draft profile. */
export const ApplyInput = z.object({
  name: z.string().min(2).max(80),
  college: z.string().min(2).max(120),
  branch: z.string().min(2).max(80),
  year: z.number().int().min(1).max(5),
  bio: z.string().max(600).optional(),
  topics: topics.optional(),
  priceINR: z.number().int().min(50).max(2000),
});

/** POST /mentor/verify/email — no `code` requests an OTP; with `code` confirms it. */
export const VerifyEmailInput = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/).optional(),
});

/** POST /mentor/verify/id — student-ID proof. `docRef` = the uploaded object key. */
export const VerifyIdInput = z.object({
  docRef: z.string().max(200).optional(),
});

/** PUT /mentor/profile — only the editable fields (locked ones rejected in domain). */
export const UpdateProfileInput = z.object({
  name: z.string().min(2).max(80).optional(),
  bio: z.string().max(600).optional(),
  topics: topics.optional(),
  priceINR: z.number().int().min(50).max(2000).optional(),
});

const Slot = z.object({
  id: z.string().min(1).max(40),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(15).max(120),
  open: z.boolean(),
});

/** PUT /mentor/availability — replace the slot list (optimistic concurrency). */
export const AvailabilityInput = z.object({
  slots: z.array(Slot).max(200),
  version: z.number().int().nonnegative().optional(),
});

/** POST /mentor/:id/review — admin decision on a pending/interviewed application. */
export const ReviewInput = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(300).optional(),
});

/** POST /admin/mentors/:id/interview — schedule the 10–15 min screening interview. */
export const InterviewInput = z.object({
  interviewAt: z.string().datetime(),
  interviewLink: z.string().url().max(400),
  note: z.string().max(300).optional(),
});
export type Interview = z.infer<typeof InterviewInput>;

export type Apply = z.infer<typeof ApplyInput>;
export type VerifyEmail = z.infer<typeof VerifyEmailInput>;
export type UpdateProfile = z.infer<typeof UpdateProfileInput>;
export type Availability = z.infer<typeof AvailabilityInput>;
export type Review = z.infer<typeof ReviewInput>;
