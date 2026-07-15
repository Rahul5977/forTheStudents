// Predictor over REAL JoSAA cutoffs. Same Safe/Target/Reach thresholds as before,
// now against official closing ranks for the caller's category + gender pool.
//
// Quota: we use AI (central institutes: IITs/IIITs/GFTIs) or OS (state institutes:
// NITs — the "Other State" cutoff, which applies to any non-home-state applicant).
// Home-State (HS) quota is deferred (needs an institute→state map).
import type { Cutoff, CollegeType, Category, Bucket, Sort } from './types';

export interface PredictInput {
  advRank: number;
  mainRank: number;
  category: Category;
  gender: string; // 'Gender-Neutral' (default) | 'Female-only (including Supernumerary)'
  types: CollegeType[];
  q: string;
  sort: Sort;
  limit: number;
}

export interface Prediction {
  id: number;
  college: string; // institute (alias kept for frontend compatibility)
  institute: string;
  branch: string;
  program: string;
  type: CollegeType;
  examLabel: string;
  quota: string;
  seatType: string;
  open: number;
  close: number;
  ratio: number;
  bucket: Bucket;
  label: 'Safe' | 'Target' | 'Reach';
  pct: number;
  homeQuota: boolean;
}

const CAT_MAP: Record<Category, string> = { Open: 'OPEN', 'OBC-NCL': 'OBC-NCL', SC: 'SC', ST: 'ST', EWS: 'EWS' };

function bucketFor(ratio: number): { bucket: Bucket; label: Prediction['label']; pct: number } {
  let bucket: Bucket; let label: Prediction['label'];
  if (ratio <= 0.9) { bucket = 'safe'; label = 'Safe'; }
  else if (ratio <= 1.15) { bucket = 'target'; label = 'Target'; }
  else { bucket = 'reach'; label = 'Reach'; }
  const pct = Math.max(8, Math.min(97, Math.round(102 - (ratio - 0.55) * 62)));
  return { bucket, label, pct };
}

function decorate(c: Cutoff, i: PredictInput): Prediction {
  const rank = c.type === 'IIT' ? i.advRank : i.mainRank;
  const ratio = rank / c.close;
  const b = bucketFor(ratio);
  return {
    id: c.id, college: c.institute, institute: c.institute, branch: c.branch, program: c.program,
    type: c.type, examLabel: c.exam === 'adv' ? 'JEE Adv' : 'JEE Main', quota: c.quota, seatType: c.seatType,
    open: c.open, close: c.close, ratio, ...b, homeQuota: false,
  };
}

export interface PredictResult {
  results: Prediction[];
  resultCount: number;
  safeCount: number;
  targetCount: number;
  reachCount: number;
  truncated: boolean;
}

export function predict(cutoffs: Cutoff[], i: PredictInput): PredictResult {
  const cat = CAT_MAP[i.category] ?? 'OPEN';
  let list = cutoffs
    .filter((c) => c.seatType.toUpperCase() === cat && c.gender === i.gender && (c.quota === 'AI' || c.quota === 'OS') && i.types.includes(c.type))
    .map((c) => decorate(c, i))
    .filter((c) => c.ratio <= 1.6);
  if (i.q && i.q.trim()) {
    const q = i.q.toLowerCase();
    list = list.filter((c) => (c.institute + ' ' + c.program).toLowerCase().includes(q));
  }
  if (i.sort === 'closing') list.sort((a, b) => a.close - b.close);
  else if (i.sort === 'location') list.sort((a, b) => a.institute.localeCompare(b.institute));
  else list.sort((a, b) => b.pct - a.pct || a.close - b.close); // 'chance'

  const resultCount = list.length;
  const safeCount = list.filter((c) => c.bucket === 'safe').length;
  const targetCount = list.filter((c) => c.bucket === 'target').length;
  const reachCount = list.filter((c) => c.bucket === 'reach').length;
  const truncated = list.length > i.limit;
  return { results: list.slice(0, i.limit), resultCount, safeCount, targetCount, reachCount, truncated };
}

export function normalizeInput(q: Record<string, string | undefined>): PredictInput {
  const types = (q.types ? q.types.split(',') : ['IIT', 'NIT', 'IIIT', 'GFTI']).filter(Boolean) as CollegeType[];
  return {
    advRank: Number(q.advRank) || 9_999_999,
    mainRank: Number(q.mainRank) || 9_999_999,
    category: (q.category as Category) || 'Open',
    gender: q.gender || 'Gender-Neutral',
    types: types.length ? types : ['IIT', 'NIT', 'IIIT', 'GFTI'],
    q: q.q || '',
    sort: (q.sort as Sort) || 'chance',
    limit: Math.min(500, Math.max(1, Number(q.limit) || 300)),
  };
}

/** One cutoff, decorated for the analysis page (+ a minimal single-year chart). */
export function analyze(cutoffs: Cutoff[], id: number, i: PredictInput): { college: Prediction; chart: { years: string[]; vals: number[]; rank: number } } | null {
  const c = cutoffs.find((x) => x.id === id);
  if (!c) return null;
  const college = decorate(c, i);
  const rank = c.type === 'IIT' ? i.advRank : i.mainRank;
  return { college, chart: { years: ['2024'], vals: [c.close], rank } };
}
