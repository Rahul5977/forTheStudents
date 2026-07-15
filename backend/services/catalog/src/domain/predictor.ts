// Business logic for catalog + predictor. Pure functions from @sc/catalog-core;
// this layer supplies the snapshot and shapes responses.
import { predict as computePredict, analyze, normalizeInput } from '@sc/catalog-core';
import { NotFoundError } from '@sc/shared';
import { loadSnapshot } from '../repo/catalog.repo';

/** GET /predict — real Safe/Target/Reach over the active JoSAA snapshot. */
export async function predict(query: Record<string, string | undefined>) {
  const input = normalizeInput(query);
  const snap = await loadSnapshot();
  const out = computePredict(snap.cutoffs, input);
  return { version: snap.version, ...out };
}

/** GET /predict/summary — bucket counts only. */
export async function predictSummary(query: Record<string, string | undefined>) {
  const { version, resultCount, safeCount, targetCount, reachCount } = await predict(query);
  return { version, resultCount, safeCount, targetCount, reachCount };
}

/** GET /colleges — distinct institutes (a browse directory), not every cutoff. */
export async function listColleges() {
  const snap = await loadSnapshot();
  const byInst = new Map<string, { institute: string; type: string; programs: number }>();
  for (const c of snap.cutoffs) {
    const e = byInst.get(c.institute) ?? { institute: c.institute, type: c.type, programs: 0 };
    e.programs++;
    byInst.set(c.institute, e);
  }
  return { version: snap.version, count: byInst.size, institutes: [...byInst.values()].sort((a, b) => a.institute.localeCompare(b.institute)) };
}

/** GET /colleges/:id — one cutoff + the caller's chance + a (single-year) chart. */
export async function getCollege(id: number, query: Record<string, string | undefined>) {
  const snap = await loadSnapshot();
  const res = analyze(snap.cutoffs, id, normalizeInput(query));
  if (!res) throw NotFoundError('Cutoff not found');
  return res;
}
