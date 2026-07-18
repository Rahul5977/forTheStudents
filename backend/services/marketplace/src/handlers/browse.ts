// Public mentor search — no auth (a browsing surface). Lightly cacheable; the
// approved-mentor set changes slowly.
import type { Context } from 'hono';
import { ValidationError } from '@sc/shared';
import * as mentors from '../domain/mentors';

const CACHEABLE = { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' };

/** GET /mentors?college&branch&topic&maxPrice&sort */
export async function listMentors(c: Context) {
  return c.json(await mentors.search(c.req.query()), 200, CACHEABLE);
}

/** GET /mentors/:id/slots — a mentor's open, future slots (for the student's booking screen). */
export async function mentorSlots(c: Context) {
  const id = c.req.param('id');
  if (!id) throw ValidationError('Missing mentor id');
  return c.json(await mentors.publicSlots(id), 200, { 'cache-control': 'public, s-maxage=15' });
}
