// Business logic for the planner: per-user shortlist + ordered choice list, and
// the server-authoritative List Doctor (reuses @sc/catalog-core to bucket choices).
import { analyze, normalizeInput, listDoctor } from '@sc/catalog-core';
import { ValidationError, ConflictError } from '@sc/shared';
import { plannerRepo } from '../repo/planner.repo';
import { loadSnapshot } from '../repo/catalog.reader';
import type { PutShortlist, PutChoiceList, Reorder } from '../types';

// ── Shortlist (unordered "saved colleges") ────────────────────────────────────
export async function getShortlist(userId: string) {
  const { ids, version } = await plannerRepo.getShortlist(userId);
  return { collegeIds: ids, version };
}

export async function putShortlist(userId: string, input: PutShortlist) {
  const { ids, version } = await plannerRepo.putShortlist(userId, input.collegeIds, input.version);
  return { collegeIds: ids, version };
}

// ── Choice list (ORDERED — order = JoSAA priority) ────────────────────────────
export async function getChoiceList(userId: string) {
  const { ids, version } = await plannerRepo.getChoiceList(userId);
  return { items: ids, version };
}

export async function putChoiceList(userId: string, input: PutChoiceList) {
  const { ids, version } = await plannerRepo.putChoiceList(userId, input.items, input.version);
  return { items: ids, version };
}

/** Move one row from `from` to `to` (0-based) — the drag-and-drop reorder. */
export async function reorder(userId: string, input: Reorder) {
  const cur = await plannerRepo.getChoiceList(userId);
  if (input.version !== undefined && input.version !== cur.version) {
    throw ConflictError('Your list changed elsewhere — reload and retry.');
  }
  const items = [...cur.ids];
  if (input.from >= items.length) throw ValidationError('`from` is out of range');
  const to = Math.min(input.to, items.length - 1);
  const [moved] = items.splice(input.from, 1);
  items.splice(to, 0, moved as number);
  const saved = await plannerRepo.putChoiceList(userId, items, cur.version);
  return { items: saved.ids, version: saved.version };
}

// ── List Doctor ───────────────────────────────────────────────────────────────
/**
 * Decorate the saved choice list with predictor buckets and run List Doctor.
 * Rank inputs come as query params (advRank/mainRank/category/home/gender) —
 * same shape as /predict — so the advice is personalised but stateless.
 */
export async function doctor(userId: string, query: Record<string, string | undefined>) {
  const { ids, version } = await plannerRepo.getChoiceList(userId);
  const snap = await loadSnapshot();
  const input = normalizeInput(query);
  // Decorate each choice in order; drop any id no longer in the active snapshot.
  const items = ids
    .map((id) => analyze(snap.cutoffs, id, input)?.college)
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const report = listDoctor(items, ids);
  return { choiceVersion: version, catalogVersion: snap.version, items, ...report };
}
