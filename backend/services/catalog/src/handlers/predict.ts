// Public predictor endpoints. No auth: predictions are shared + CDN-cacheable
// (personalization is a pure function of the query, not of identity).
import type { Context } from 'hono';
import * as domain from '../domain/predictor';

// Cache shared results at the edge for a few minutes (SWR). Safe: no per-user data.
const CACHEABLE = { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' };

export async function predict(c: Context) {
  const data = await domain.predict(c.req.query());
  return c.json(data, 200, CACHEABLE);
}

export async function predictSummary(c: Context) {
  const data = await domain.predictSummary(c.req.query());
  return c.json(data, 200, CACHEABLE);
}
