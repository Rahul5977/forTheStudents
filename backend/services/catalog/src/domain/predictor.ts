// Business logic for catalog + predictor. Pure functions from @sc/catalog-core;
// this layer just supplies the snapshot and shapes responses.
import { predict as computePredict, decorate, chartData, normalizeInput, type PredictInput } from '@sc/catalog-core';
import { NotFoundError } from '@sc/shared';
import { loadSnapshot, getOffering } from '../repo/catalog.repo';

/** GET /predict — filtered Safe/Target/Reach results over the active snapshot. */
export async function predict(query: Record<string, string | undefined>) {
  const input = normalizeInput(query);
  const snap = await loadSnapshot();
  const out = computePredict(snap.offerings, input);
  return { version: snap.version, ...out };
}

/** GET /predict/summary — just the bucket counts (cheap, for the dashboard). */
export async function predictSummary(query: Record<string, string | undefined>) {
  const { version, resultCount, safeCount, targetCount, reachCount } = await predict(query);
  return { version, resultCount, safeCount, targetCount, reachCount };
}

/** GET /colleges — the full offering list (no personalization). */
export async function listColleges() {
  const snap = await loadSnapshot();
  return { version: snap.version, colleges: snap.offerings };
}

/**
 * GET /colleges/:id — one offering + (if a rank is given) the caller's chance and
 * the cutoff-trend chart with their rank marked. This is the College Analysis data.
 */
export async function getCollege(id: number, query: Record<string, string | undefined>) {
  const offering = await getOffering(id);
  if (!offering) throw NotFoundError('College offering not found');
  const input: PredictInput = normalizeInput(query);
  const decorated = decorate(offering, input);
  const chart = chartData(offering, input);
  return { college: decorated, chart };
}
