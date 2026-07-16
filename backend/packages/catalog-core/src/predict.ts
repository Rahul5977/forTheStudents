// Predictor over REAL JoSAA cutoffs. Safe/Target/Reach against official closing
// ranks for the caller's category + gender pool, with proper quota selection:
//   • AI (All-India) for central institutes (IITs / most IIITs / GFTIs)
//   • HS (Home-State) when the institute's state == the caller's home state  ← easier
//   • else OS (Other-State)
//
// ORDERING (the important fix): the default sort is meant for JoSAA CHOICE-FILLING.
// The list a rank-6000 student wants to see first is the STRONGEST colleges they can
// realistically target — i.e. the ones with the LOWEST (most competitive) closing rank
// that are still within reach — NOT the safest/weakest ones. So the default order is
// by CLOSING RANK ASCENDING. The old "chance % descending" default did the opposite:
// it floated the over-safe colleges (closing far above the student's rank, ~100% chance)
// to the top, burying the good targets. That behavior is still available opt-in as
// 'chance'/'safest'.
import type { Cutoff, EnrichedCutoff, ForecastBand, CollegeType, Category, Bucket, Sort } from './types';
import { forecastChance } from './chance';

export interface PredictInput {
  advRank: number;
  mainRank: number;
  category: Category;
  home: string; // home state (for HS quota)
  gender: string;
  types: CollegeType[];
  q: string;
  sort: Sort;
  limit: number;
  // Predictor view hides hopeless reaches + pointlessly over-safe colleges (the "realistic
  // window"). A college PROFILE wants every branch, so it sets this false.
  applyWindow: boolean;
}

export interface Prediction {
  id: number;
  instituteId: string; // canonical slug → links to the college profile page
  college: string; // short display name (alias kept for frontend compatibility)
  institute: string; // full official name
  branch: string;
  program: string;
  type: CollegeType;
  examLabel: string;
  quota: string;
  seatType: string;
  city: string;
  state: string;
  nirf: number | null;
  feesTxt: string;
  open: number;
  close: number; // current-year (2024) closing rank
  ratio: number;
  bucket: Bucket;
  label: 'Safe' | 'Target' | 'Reach';
  pct: number; // headline chance %: forecast-based when a band exists, else ratio-based
  homeQuota: boolean;
  // ── forecast layer (present when the seat has a precomputed band) ──
  forecast?: ForecastBand; // 2026 predicted closing-rank range
  history?: { year: number; close: number }[]; // observed trend, for the chart
  chanceBasis: 'forecast' | 'ratio'; // which method produced `pct`
}

const CAT_MAP: Record<Category, string> = { Open: 'OPEN', 'OBC-NCL': 'OBC-NCL', SC: 'SC', ST: 'ST', EWS: 'EWS' };

// ── Bucket thresholds (ratio = studentRank / closingRank) ────────────────────
// ratio < 1  → your rank is BETTER (numerically smaller) than the closing rank.
//   SAFE   (ratio ≤ 0.80): you clear the cutoff with ≥20% margin — a dependable backup.
//   TARGET (ratio ≤ 1.10): borderline — right around the closing rank, a fair shot.
//   REACH  (else)        : a stretch — your rank is worse than last year's closing.
const SAFE_MAX = 0.8;
const TARGET_MAX = 1.1;

// ── Realistic window (which colleges to show at all) ─────────────────────────
// HIDE hopeless reaches: studentRank far worse than closing (ratio > REACH_MAX).
//   1.6 ≈ your rank is 60% past the closing rank — realistically unattainable.
// HIDE pointless over-safe colleges: closing absurdly far above your rank, i.e.
//   closing > OVERSAFE_MULT × rank  ⟺  ratio < 1/OVERSAFE_MULT. A college whose
//   closing rank is 5× worse than you is far beneath your level — nobody fills it.
// We DON'T over-filter: genuine safe backups (ratio in [0.2, 0.8]) always survive.
const REACH_MAX = 1.6;
const OVERSAFE_MULT = 5; // closing > 5×rank ⟺ ratio < 0.2 → dropped as pointlessly safe
const OVERSAFE_MIN_RATIO = 1 / OVERSAFE_MULT; // 0.2

const clamp = (lo: number, hi: number, x: number) => Math.max(lo, Math.min(hi, x));

function bucketFor(ratio: number): { bucket: Bucket; label: Prediction['label']; pct: number } {
  let bucket: Bucket; let label: Prediction['label'];
  if (ratio <= SAFE_MAX) { bucket = 'safe'; label = 'Safe'; }
  else if (ratio <= TARGET_MAX) { bucket = 'target'; label = 'Target'; }
  else { bucket = 'reach'; label = 'Reach'; }
  // Friendly chance %, strictly monotonic decreasing in ratio (better ratio → higher %).
  // Anchors: ratio 0.2→98, 0.5→88, 0.8→70, 1.0→58, 1.1→52, 1.6→22.
  const pct = clamp(6, 98, Math.round(100 - (ratio - 0.3) * 60));
  return { bucket, label, pct };
}

/** Ratio with safe division; a non-positive/absent closing rank ⇒ effectively unreachable. */
function ratioOf(rank: number, close: number): number {
  return close > 0 ? rank / close : Number.POSITIVE_INFINITY;
}

function decorate(c: EnrichedCutoff, i: PredictInput, homeQuota: boolean): Prediction {
  const rank = c.type === 'IIT' ? i.advRank : i.mainRank;
  const ratio = ratioOf(rank, c.close);
  const base = {
    id: c.id, instituteId: c.instituteId, college: c.short, institute: c.institute, branch: c.branch, program: c.program, type: c.type,
    examLabel: c.exam === 'adv' ? 'JEE Adv' : 'JEE Main', quota: c.quota, seatType: c.seatType,
    city: c.city, state: c.state, nirf: c.nirf, feesTxt: `₹${c.feesLakh}L`, open: c.open, close: c.close,
    ratio, homeQuota, forecast: c.forecast, history: c.history,
  };
  // Prefer the calibrated 2026 forecast chance when a band exists; else the ratio heuristic.
  if (c.forecast) {
    const fc = forecastChance(c.forecast, rank);
    return { ...base, bucket: fc.bucket, label: fc.label, pct: fc.pct, chanceBasis: 'forecast' };
  }
  return { ...base, ...bucketFor(ratio), chanceBasis: 'ratio' };
}

/** Normalize a state name for a robust match: case-insensitive, trimmed, punctuation/
 *  whitespace-insensitive, '&'→'and'. So "Tamil Nadu", "tamil nadu", "TamilNadu",
 *  "Jammu & Kashmir" / "Jammu and Kashmir" all compare equal. */
function normState(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}
function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normState(a);
  return na !== '' && na === normState(b);
}

/** Choose the applicable quota row per institute+program for this caller.
 *  AI wins outright (central institutes). Otherwise HS is used ONLY when the
 *  institute's state matches the caller's home state (the home advantage); else OS. */
function pickByQuota(rows: Cutoff[], home: string): { cutoff: Cutoff; homeQuota: boolean } {
  const ai = rows.find((r) => r.quota === 'AI');
  if (ai) return { cutoff: ai, homeQuota: false };
  const hs = rows.find((r) => r.quota === 'HS');
  const os = rows.find((r) => r.quota === 'OS');
  if (hs && sameState(hs.state, home)) return { cutoff: hs, homeQuota: true };
  return { cutoff: os ?? hs ?? rows[0]!, homeQuota: false };
}

export interface PredictResult {
  results: Prediction[];
  resultCount: number;
  safeCount: number;
  targetCount: number;
  reachCount: number;
  truncated: boolean;
}

// NIRF: better (smaller) rank first; unranked (null) always sinks to the bottom.
function nirfCmp(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function comparator(sort: Sort): (a: Prediction, b: Prediction) => number {
  switch (sort) {
    case 'closing':
      return (a, b) => a.close - b.close;
    case 'location':
      return (a, b) => a.college.localeCompare(b.college);
    case 'chance':
    case 'safest':
      // OLD default (opt-in now): highest chance first — floats safe backups to the top.
      return (a, b) => b.pct - a.pct || a.close - b.close;
    case 'best':
    default:
      // NEW default: best reachable colleges first.
      // closing ASC (most competitive the student can target first) →
      //   NIRF asc (nulls last) → chance % desc.
      return (a, b) => a.close - b.close || nirfCmp(a.nirf, b.nirf) || b.pct - a.pct;
  }
}

export function predict(cutoffs: EnrichedCutoff[], i: PredictInput): PredictResult {
  const cat = CAT_MAP[i.category] ?? 'OPEN';
  const relevant = cutoffs.filter(
    (c) => c.seatType.toUpperCase() === cat && c.gender === i.gender && i.types.includes(c.type) && (c.quota === 'AI' || c.quota === 'HS' || c.quota === 'OS'),
  );
  // Group by institute+program, then pick the applicable quota (AI/HS/OS).
  const groups = new Map<string, Cutoff[]>();
  for (const c of relevant) {
    const k = c.institute + '|' + c.program;
    const g = groups.get(k);
    if (g) g.push(c); else groups.set(k, [c]);
  }
  let list = [...groups.values()]
    .map((rows) => { const { cutoff, homeQuota } = pickByQuota(rows, i.home); return decorate(cutoff, i, homeQuota); });
  // Realistic window (predictor only): drop hopeless reaches AND pointlessly over-safe
  // colleges, but always keep genuine safe backups (ratio in [0.2, 1.6]). A profile skips
  // this so every branch of the college is shown.
  if (i.applyWindow) list = list.filter((c) => c.ratio <= REACH_MAX && c.ratio >= OVERSAFE_MIN_RATIO);

  if (i.q && i.q.trim()) {
    const q = i.q.toLowerCase();
    list = list.filter((c) => (c.institute + ' ' + c.college + ' ' + c.program).toLowerCase().includes(q));
  }
  list.sort(comparator(i.sort));

  const resultCount = list.length;
  const safeCount = list.filter((c) => c.bucket === 'safe').length;
  const targetCount = list.filter((c) => c.bucket === 'target').length;
  const reachCount = list.filter((c) => c.bucket === 'reach').length;
  return { results: list.slice(0, i.limit), resultCount, safeCount, targetCount, reachCount, truncated: list.length > i.limit };
}

export function normalizeInput(q: Record<string, string | undefined>): PredictInput {
  const types = (q.types ? q.types.split(',') : ['IIT', 'NIT', 'IIIT', 'GFTI']).filter(Boolean) as CollegeType[];
  return {
    advRank: Number(q.advRank) || 9_999_999,
    mainRank: Number(q.mainRank) || 9_999_999,
    category: (q.category as Category) || 'Open',
    home: q.home || '',
    gender: q.gender || 'Gender-Neutral',
    types: types.length ? types : ['IIT', 'NIT', 'IIIT', 'GFTI'],
    q: q.q || '',
    // Default is the choice-filling order (best reachable first), not the old 'chance'.
    sort: (q.sort as Sort) || 'best',
    limit: Math.min(500, Math.max(1, Number(q.limit) || 300)),
    applyWindow: true, // predictor default; the profile overrides to false
  };
}

/** One cutoff (by id), decorated for the analysis page + the multi-year trend chart
 *  (observed history + the 2026 forecast point). Consistent with predict()'s decoration. */
export function analyze(cutoffs: EnrichedCutoff[], id: number, i: PredictInput) {
  const c = cutoffs.find((x) => x.id === id);
  if (!c) return null;
  const homeQuota = c.quota === 'HS' && sameState(c.state, i.home);
  const college = decorate(c, i, homeQuota);
  const rank = c.type === 'IIT' ? i.advRank : i.mainRank;
  // Chart: observed closing ranks per year, then the forecast band as the target-year point.
  const hist = c.history && c.history.length ? c.history : [{ year: c.year, close: c.close }];
  const years = hist.map((h) => String(h.year));
  const vals = hist.map((h) => h.close);
  const forecast = c.forecast
    ? { year: c.forecast.targetYear, predicted: c.forecast.predicted, low: c.forecast.low, high: c.forecast.high }
    : null;
  return { college, chart: { years, vals, rank, forecast } };
}
