// Admin verification-queue endpoints (role=admin). The full admin console is Phase 7;
// this is the minimal hook that lets the approve/reject workflow run end-to-end.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { ReviewInput, InterviewInput } from '../types';
import * as mentors from '../domain/mentors';

/** GET /admin/mentors/pending -> mentors awaiting review */
export async function listPending(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(await mentors.listPending(p));
}

/** POST /admin/mentors/:id/review { decision: approve|reject, note? } */
export async function review(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing mentor id');
  const parsed = ReviewInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid review', parsed.error.flatten());
  return c.json(await mentors.review(p, id, parsed.data));
}

/** POST /admin/mentors/:id/interview { interviewAt, interviewLink, note? } */
export async function scheduleInterview(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing mentor id');
  const parsed = InterviewInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid interview', parsed.error.flatten());
  return c.json(await mentors.scheduleInterview(p, id, parsed.data));
}
