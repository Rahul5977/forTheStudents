// Mentor self-service endpoints (behind the Cognito authorizer — the caller acts
// on their own MENTOR#<sub> record). Thin: parse (zod) → domain → JSON.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { ApplyInput, VerifyEmailInput, PresignInput, ConfirmDocumentInput, UpdateProfileInput, AvailabilityInput } from '../types';
import * as application from '../domain/application';
import * as mentors from '../domain/mentors';

const readBody = (c: Context) => c.req.json().catch(() => ({}));

/** POST /mentor/apply — create/refresh the DRAFT */
export async function apply(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = ApplyInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid application', parsed.error.flatten());
  return c.json(application.ownerView(await application.apply(p, parsed.data)));
}

/** POST /mentor/verify/email — request an OTP (no code) or confirm it (with code). */
export async function verifyEmail(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = VerifyEmailInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid email verification', parsed.error.flatten());
  return c.json(await application.verifyEmail(p, parsed.data));
}

/** POST /mentor/documents/presign { docType, contentType, sizeBytes } */
export async function presignDocument(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = PresignInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid upload request', parsed.error.flatten());
  return c.json(await application.presignDocument(p, parsed.data));
}

/** POST /mentor/documents/confirm { key } */
export async function confirmDocument(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = ConfirmDocumentInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid confirm', parsed.error.flatten());
  return c.json(await application.confirmDocument(p, parsed.data.key));
}

/** POST /mentor/submit — DRAFT → PENDING_REVIEW when complete (400 lists EVERY missing item) */
export async function submit(c: Context<AppEnv>) {
  return c.json(await application.submit(getPrincipal(c)));
}

/** GET /mentor/profile — own application (documents as metadata, completeness, status) */
export async function getProfile(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(application.ownerView(await application.loadOwn(p.userId)));
}

/** PUT /mentor/profile */
export async function putProfile(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = UpdateProfileInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid profile update', parsed.error.flatten());
  return c.json(application.ownerView(await mentors.updateProfile(p.userId, parsed.data)));
}

/** GET /mentor/availability */
export async function getAvailability(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(await mentors.getAvailability(p.userId));
}

/** PUT /mentor/availability */
export async function putAvailability(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = AvailabilityInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid availability', parsed.error.flatten());
  return c.json(await mentors.putAvailability(p.userId, parsed.data));
}
