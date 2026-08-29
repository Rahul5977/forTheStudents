// Transport DTOs (zod) + shared types for the marketplace-mentors service.
// The mentor STATUS union + state machine live in @sc/shared (mentor-state.ts) so the admin
// service uses the very same rules. Validation at the edge (here); authorization in the domain.
import { z } from 'zod';
import type { MentorStatus } from '@sc/shared';
export type { MentorStatus } from '@sc/shared';

const topics = z.array(z.string().min(1).max(40)).max(12);
const languages = z.array(z.string().min(2).max(24)).max(8);
// Essays are LENGTH-checked at SUBMIT (100–800 chars); a DRAFT may hold a partial essay.
const essayDraft = z.string().max(800);

/**
 * POST /mentor/apply — create/refresh the mentor's DRAFT application.
 * The original Phase-4 fields stay required; every Phase-11 field is optional here so the
 * form can be saved incrementally. Completeness is enforced by POST /mentor/submit.
 */
export const ApplyInput = z.object({
  // Identity
  name: z.string().min(2).max(80),
  college: z.string().min(2).max(120),
  branch: z.string().min(2).max(80),
  year: z.number().int().min(1).max(5),
  gradYear: z.number().int().min(2024).max(2035).optional(),
  rollNumber: z.string().min(2).max(40).optional(),
  // Contact (the .ac.in email is verified via OTP, not typed here)
  phone: z.string().regex(/^\+?[0-9]{10,13}$/, 'Enter a 10–13 digit phone number').optional(),
  // Profile
  bio: z.string().max(600).optional(),
  topics: topics.optional(),
  priceINR: z.number().int().min(50).max(2000),
  languages: languages.optional(),
  jeeRank: z.number().int().positive().max(2_000_000).optional(),
  jeeYear: z.number().int().min(2015).max(2035).optional(),
  // Essays
  essays: z.object({ why: essayDraft.optional(), how: essayDraft.optional(), other: essayDraft.optional() }).optional(),
  // Consent — stored with timestamp + version
  consent: z.object({ accepted: z.literal(true), version: z.string().min(1).max(20) }).optional(),
});

/** POST /mentor/verify/email — no `code` requests an OTP; with `code` confirms it. */
export const VerifyEmailInput = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/).optional(),
});

export const DOC_TYPES = ['id_card', 'supporting'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const DOC_MAX_BYTES = 5 * 1024 * 1024;

/** POST /mentor/documents/presign — the server picks the key; the client never does. */
export const PresignInput = z.object({
  docType: z.enum(DOC_TYPES),
  contentType: z.enum(DOC_CONTENT_TYPES, { errorMap: () => ({ message: 'Only JPEG, PNG, WebP or PDF' }) }),
  sizeBytes: z.number().int().positive().max(DOC_MAX_BYTES, `Max ${DOC_MAX_BYTES / 1024 / 1024} MB`),
});

/** POST /mentor/documents/confirm — after the browser PUT succeeded. */
export const ConfirmDocumentInput = z.object({
  key: z.string().min(1).max(300),
});

/** PUT /mentor/profile — only the editable fields (locked ones rejected in domain). */
export const UpdateProfileInput = z.object({
  name: z.string().min(2).max(80).optional(),
  bio: z.string().max(600).optional(),
  topics: topics.optional(),
  priceINR: z.number().int().min(50).max(2000).optional(),
  languages: languages.optional(),
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

/**
 * POST /admin/mentors/:id/review — the post-interview decision.
 *   approve                    INTERVIEW_SCHEDULED → APPROVED
 *   reject, kind=hard (default) → REJECTED (terminal; documents expire via lifecycle)
 *   reject, kind=soft          → DRAFT (reviewer note shown to the mentor; re-apply allowed)
 * A rejection ALWAYS needs a reason.
 */
export const ReviewInput = z.object({
  decision: z.enum(['approve', 'reject']),
  kind: z.enum(['soft', 'hard']).optional(),
  note: z.string().max(600).optional(),
}).refine((v) => v.decision !== 'reject' || (v.note ?? '').trim().length >= 5, {
  message: 'A rejection needs a reason (min 5 characters).', path: ['note'],
});

/** POST /admin/mentors/:id/fields/:field — per-field manual verification. */
export const FieldVerifyInput = z.object({
  status: z.enum(['VERIFIED', 'FLAGGED', 'UNVERIFIED']),
  note: z.string().max(300).optional(),
});

/**
 * POST /admin/mentors/:id/interview — schedule the 10–15 min screening interview.
 * NEW shape: { interviewAt, durationMin?, note? } → the Meet link is server-generated.
 * LEGACY shape (one release): { interviewAt, interviewLink, note? } → the link is honoured
 * and no Calendar event is created. `interviewLink` is dropped next release.
 */
export const InterviewInput = z.object({
  interviewAt: z.string().datetime(),
  durationMin: z.number().int().min(10).max(60).optional(),
  note: z.string().max(300).optional(),
  interviewLink: z.string().url().max(400).optional(), // DEPRECATED — see above
});
/** PATCH /admin/mentors/:id/interview — reschedule (same Calendar event). */
export const RescheduleInput = z.object({
  interviewAt: z.string().datetime(),
  durationMin: z.number().int().min(10).max(60).optional(),
  note: z.string().max(300).optional(),
});

/** GET /admin/mentors?status=&q=&cursor=&limit= */
export const QueueQuery = z.object({
  status: z.string().optional(),
  q: z.string().max(80).optional(),
  cursor: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type Apply = z.infer<typeof ApplyInput>;
export type VerifyEmail = z.infer<typeof VerifyEmailInput>;
export type Presign = z.infer<typeof PresignInput>;
export type UpdateProfile = z.infer<typeof UpdateProfileInput>;
export type Availability = z.infer<typeof AvailabilityInput>;
export type Review = z.infer<typeof ReviewInput>;
export type FieldVerify = z.infer<typeof FieldVerifyInput>;
export type Interview = z.infer<typeof InterviewInput>;
export type Reschedule = z.infer<typeof RescheduleInput>;
export type Queue = z.infer<typeof QueueQuery>;
export type Status = MentorStatus;
