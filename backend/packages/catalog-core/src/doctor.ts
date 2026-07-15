// List Doctor — pure rules over an ORDERED choice list, decorated with predictor
// buckets. Server-authoritative twin of the frontend `lib/logic.js#listDoctor`,
// so the app and the API always agree on the same advice. See docs/architecture.md §5.4.
import type { Bucket } from './types';

export type DoctorSeverity = 'high' | 'med' | 'ok';

export interface DoctorWarning {
  sev: DoctorSeverity;
  title: string;
  detail: string;
}

export interface DoctorReport {
  warnings: DoctorWarning[];
  summary: { total: number; safe: number; target: number; reach: number };
}

/**
 * Run List Doctor over a choice list.
 * @param choices decorated choices IN JoSAA priority order (each carries a `bucket`).
 * @param ids     the raw ordered id list — used only to count duplicates.
 */
export function listDoctor(choices: { bucket: Bucket }[], ids: number[]): DoctorReport {
  const total = choices.length;
  const safe = choices.filter((c) => c.bucket === 'safe').length;
  const target = choices.filter((c) => c.bucket === 'target').length;
  const reach = choices.filter((c) => c.bucket === 'reach').length;
  const topReach = choices.slice(0, 3).filter((c) => c.bucket === 'reach').length;
  const dupes = ids.length - new Set(ids).size;

  const warnings: DoctorWarning[] = [];
  if (total === 0) {
    warnings.push({ sev: 'high', title: 'Empty list', detail: 'Add colleges from the predictor to start building your choice list.' });
    return { warnings, summary: { total, safe, target, reach } };
  }
  // Rules mirror the frontend, in the same order.
  if (safe === 0) warnings.push({ sev: 'high', title: 'No Safe colleges', detail: 'Add at least 2–3 Safe options so you’re never left unallotted.' });
  if (total < 6) warnings.push({ sev: 'med', title: 'Too few choices', detail: `Aspirants usually fill 15–40 choices. You have ${total}.` });
  if (topReach >= 2) warnings.push({ sev: 'med', title: 'Reach-heavy at the top', detail: 'Your first few choices are mostly Reach — fine only if you’re okay skipping an early round.' });
  if (dupes > 0) warnings.push({ sev: 'high', title: 'Duplicate choices', detail: `You have ${dupes} duplicate college-branch row(s).` });
  if (warnings.length === 0) warnings.push({ sev: 'ok', title: 'List looks healthy', detail: 'Good spread of Safe, Target and Reach. You’re ready to lock.' });

  return { warnings, summary: { total, safe, target, reach } };
}
