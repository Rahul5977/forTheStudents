// GET /colleges/compare — batch analysis for the side-by-side Compare page.
// The Compare UI used to fetch each college one-by-one (N+1). This decorates 2..6 row
// ids in a single call using the SAME analyze() decoration as GET /colleges/:id — so each
// entry carries identical fields (chance + trend + forecast) and the UI consumes it exactly
// like a single-college response.
import { analyze, normalizeInput } from '@sc/catalog-core';
import { ValidationError, NotFoundError } from '@sc/shared';
import { loadSnapshot } from '../repo/catalog.repo';

const MIN_IDS = 2;
const MAX_IDS = 6;

/** Parse ?ids=1,6,42 → a de-duped list of positive integer row ids (2..6 of them). */
export function parseCompareIds(raw: string | undefined): number[] {
  const parts = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ids: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1) throw ValidationError('Invalid college id in ids');
    if (!ids.includes(n)) ids.push(n); // de-dupe, keep first-seen order
  }
  if (ids.length < MIN_IDS || ids.length > MAX_IDS) {
    throw ValidationError(`Compare needs between ${MIN_IDS} and ${MAX_IDS} college ids`);
  }
  return ids;
}

/** Decorate 2..6 cutoffs (by numeric row id) for the Compare view — one snapshot, no N+1.
 *  Each entry is the same { college, chart } shape as GET /colleges/:id; ids that don't
 *  resolve are skipped, so one stale id can't blank the whole comparison. */
export async function compare(query: Record<string, string | undefined>) {
  const ids = parseCompareIds(query.ids);
  const snap = await loadSnapshot();
  const input = normalizeInput(query);
  const results = ids
    .map((id) => analyze(snap.cutoffs, id, input))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (results.length === 0) throw NotFoundError('No colleges found for the given ids');
  return { version: snap.version, count: results.length, results };
}
