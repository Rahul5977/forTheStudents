// Business logic for catalog + predictor. Pure functions from @sc/catalog-core;
// this layer supplies the snapshot and shapes responses.
import { predict as computePredict, analyze, normalizeInput, distinctInstitutes } from '@sc/catalog-core';
import type { EnrichedCutoff, PredictInput } from '@sc/catalog-core';
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

/** GET /colleges — the canonical institute directory (browse), keyed by stable id. */
export async function listColleges() {
  const snap = await loadSnapshot();
  const institutes = distinctInstitutes(snap.cutoffs);
  return { version: snap.version, count: institutes.length, institutes };
}

/** GET /colleges/:id — one cutoff (by numeric row id) + chance + multi-year trend. */
export async function getCollege(id: number, query: Record<string, string | undefined>) {
  const snap = await loadSnapshot();
  const res = analyze(snap.cutoffs, id, normalizeInput(query));
  if (!res) throw NotFoundError('Cutoff not found');
  return res;
}

// Categories/genders/quotas present for an institute (so the UI can offer real filters).
function facets(rows: EnrichedCutoff[]) {
  const seatTypes = new Set<string>(); const genders = new Set<string>(); const quotas = new Set<string>();
  for (const r of rows) { seatTypes.add(r.seatType); genders.add(r.gender); quotas.add(r.quota); }
  return { seatTypes: [...seatTypes].sort(), genders: [...genders].sort(), quotas: [...quotas].sort() };
}

/**
 * GET /colleges/:id/profile — the deep per-college page, keyed by the CANONICAL institute
 * id (slug). Returns the institute header + the student-scoped branch cutoffs with the
 * 2026 forecast band, trend and (if a rank is given) calibrated chance — best branches
 * first. Content sections (fees/seat-matrix/placements/photos) are wired in Phase 3.
 */
export async function getCollegeProfile(instituteId: string, query: Record<string, string | undefined>) {
  const snap = await loadSnapshot();
  const rows = snap.cutoffs.filter((c) => c.instituteId === instituteId);
  if (rows.length === 0) throw NotFoundError('College not found');

  // Profile shows EVERY branch (no realistic-window filter), up to a high cap.
  const input: PredictInput = { ...normalizeInput(query), limit: 500, applyWindow: false };
  // Reuse the full predictor (quota pick + forecast + chance) scoped to this institute's rows.
  const pred = computePredict(rows, input);

  const sample = rows.find((c) => c.forecast) ?? rows[0]!;
  const info = {
    id: instituteId,
    short: sample.short,
    institute: sample.institute,
    type: sample.type,
    exam: sample.exam,
    city: sample.city,
    state: sample.state,
    nirf: sample.nirf,
    feesLakh: sample.feesLakh,
  };

  return {
    version: snap.version,
    institute: info,
    facets: facets(rows),
    branchCount: new Set(rows.map((r) => r.program)).size,
    // The student-scoped, forecast-decorated branch list (best reachable first).
    branches: pred.results,
    summary: { resultCount: pred.resultCount, safeCount: pred.safeCount, targetCount: pred.targetCount, reachCount: pred.reachCount },
    // ── content layer (Phase 3) — shape declared now, populated by the content dataset ──
    content: {
      about: null as string | null,
      established: null as number | null,
      website: null as string | null,
      fees: null,
      seatMatrix: null,
      placements: null,
      photos: [] as unknown[],
      note: 'Fees / seat matrix / placements / photos land in Phase 3 (curated + NIRF + Wikimedia).',
    },
  };
}
