// Admin verification endpoints. Role + SCOPE are enforced in the domain (requireScope);
// the routes also sit behind the Cognito authorizer in infra. Thin: parse → domain → JSON.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { ReviewInput, InterviewInput, RescheduleInput, FieldVerifyInput, QueueQuery, DOC_TYPES, type DocType } from '../types';
import * as verification from '../domain/verification';

const idOf = (c: Context) => { const id = c.req.param('id'); if (!id) throw ValidationError('Missing mentor id'); return id; };
const readBody = (c: Context) => c.req.json().catch(() => ({}));

/** GET /admin/mentors?status=&q=&cursor=&limit= — one status partition, oldest-first, cursor-paged */
export async function queue(c: Context<AppEnv>) {
  const parsed = QueueQuery.safeParse(c.req.query());
  if (!parsed.success) throw ValidationError('Invalid query', parsed.error.flatten());
  return c.json(await verification.queue(getPrincipal(c), parsed.data));
}

/** GET /admin/mentors/counts — per-status counts (Query+COUNT, no scan) */
export async function counts(c: Context<AppEnv>) {
  return c.json(await verification.counts(getPrincipal(c)));
}

/** GET /admin/mentors/pending — LEGACY flat queue (deployed console); dropped next release */
export async function listPending(c: Context<AppEnv>) {
  return c.json(await verification.listPending(getPrincipal(c)));
}

/** GET /admin/mentors/:id — the full application */
export async function getApplication(c: Context<AppEnv>) {
  return c.json(await verification.getApplication(getPrincipal(c), idOf(c)));
}

/** GET /admin/mentors/:id/documents/:docType/url — short-TTL presigned GET (audited) */
export async function documentUrl(c: Context<AppEnv>) {
  const docType = c.req.param('docType') as DocType;
  if (!(DOC_TYPES as readonly string[]).includes(docType)) throw ValidationError('Unknown document type');
  return c.json(await verification.documentUrl(getPrincipal(c), idOf(c), docType));
}

/** POST /admin/mentors/:id/fields/:field { status, note? } */
export async function setField(c: Context<AppEnv>) {
  const field = c.req.param('field');
  if (!field) throw ValidationError('Missing field');
  const parsed = FieldVerifyInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid field verification', parsed.error.flatten());
  return c.json(await verification.setField(getPrincipal(c), idOf(c), field, parsed.data));
}

/** POST /admin/mentors/:id/verify-docs — PENDING_REVIEW → DOCS_VERIFIED (all required items VERIFIED) */
export async function verifyDocs(c: Context<AppEnv>) {
  return c.json(await verification.verifyDocs(getPrincipal(c), idOf(c)));
}

/** POST /admin/mentors/:id/review { decision, kind?, note } */
export async function review(c: Context<AppEnv>) {
  const parsed = ReviewInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid review', parsed.error.flatten());
  return c.json(await verification.review(getPrincipal(c), idOf(c), parsed.data));
}

/** POST /admin/mentors/:id/interview { interviewAt, durationMin?, note? } (legacy: + interviewLink) */
export async function scheduleInterview(c: Context<AppEnv>) {
  const parsed = InterviewInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid interview', parsed.error.flatten());
  return c.json(await verification.scheduleInterview(getPrincipal(c), idOf(c), parsed.data));
}

/** PATCH /admin/mentors/:id/interview { interviewAt, durationMin?, note? } */
export async function rescheduleInterview(c: Context<AppEnv>) {
  const parsed = RescheduleInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid reschedule', parsed.error.flatten());
  return c.json(await verification.rescheduleInterview(getPrincipal(c), idOf(c), parsed.data));
}

/** DELETE /admin/mentors/:id/interview */
export async function cancelInterview(c: Context<AppEnv>) {
  return c.json(await verification.cancelInterview(getPrincipal(c), idOf(c)));
}
