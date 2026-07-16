// Public college catalog + analysis endpoints (CDN-cacheable).
import type { Context } from 'hono';
import { ValidationError } from '@sc/shared';
import * as domain from '../domain/predictor';

const CACHEABLE = { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' };

export async function listColleges(c: Context) {
  return c.json(await domain.listColleges(), 200, CACHEABLE);
}

export async function getCollege(c: Context) {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) throw ValidationError('Invalid college id');
  // Note: passes through ?advRank/&category/&home so we can mark "your chance".
  return c.json(await domain.getCollege(id, c.req.query()), 200, CACHEABLE);
}

// GET /colleges/:id/profile — deep per-college page, keyed by the canonical slug id.
export async function getCollegeProfile(c: Context) {
  const id = String(c.req.param('id') || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,64}$/.test(id)) throw ValidationError('Invalid college id');
  return c.json(await domain.getCollegeProfile(id, c.req.query()), 200, CACHEABLE);
}
