// Predictor over REAL JoSAA cutoffs. Safe/Target/Reach against official closing
// ranks for the caller's category + gender pool, with proper quota selection:
//   • AI (All-India) for central institutes (IITs / most IIITs / GFTIs)
//   • HS (Home-State) when the institute's state == the caller's home state  ← easier
//   • else OS (Other-State)
import type { Cutoff, CollegeType, Category, Bucket, Sort } from './types';

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
}

export interface Prediction {
  id: number;
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

function decorate(c: Cutoff, i: PredictInput, homeQuota: boolean): Prediction {
  const rank = c.type === 'IIT' ? i.advRank : i.mainRank;
  const ratio = rank / c.close;
  return {
    id: c.id, college: c.short, institute: c.institute, branch: c.branch, program: c.program, type: c.type,
    examLabel: c.exam === 'adv' ? 'JEE Adv' : 'JEE Main', quota: c.quota, seatType: c.seatType,
    city: c.city, state: c.state, nirf: c.nirf, feesTxt: `₹${c.feesLakh}L`, open: c.open, close: c.close,
    ratio, ...bucketFor(ratio), homeQuota,
  };
}

/** Choose the applicable quota row per institute+program for this caller. */
function pickByQuota(rows: Cutoff[], home: string): { cutoff: Cutoff; homeQuota: boolean } {
  const ai = rows.find((r) => r.quota === 'AI');
  if (ai) return { cutoff: ai, homeQuota: false };
  const hs = rows.find((r) => r.quota === 'HS');
  if (hs && hs.state && hs.state === home) return { cutoff: hs, homeQuota: true };
  const os = rows.find((r) => r.quota === 'OS');
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

export function predict(cutoffs: Cutoff[], i: PredictInput): PredictResult {
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
    .map((rows) => { const { cutoff, homeQuota } = pickByQuota(rows, i.home); return decorate(cutoff, i, homeQuota); })
    .filter((c) => c.ratio <= 1.6);

  if (i.q && i.q.trim()) {
    const q = i.q.toLowerCase();
    list = list.filter((c) => (c.institute + ' ' + c.college + ' ' + c.program).toLowerCase().includes(q));
  }
  if (i.sort === 'closing') list.sort((a, b) => a.close - b.close);
  else if (i.sort === 'location') list.sort((a, b) => a.college.localeCompare(b.college));
  else list.sort((a, b) => b.pct - a.pct || a.close - b.close);

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
    sort: (q.sort as Sort) || 'chance',
    limit: Math.min(500, Math.max(1, Number(q.limit) || 300)),
  };
}

/** One cutoff (by id), decorated for the analysis page + a single-year chart. */
export function analyze(cutoffs: Cutoff[], id: number, i: PredictInput) {
  const c = cutoffs.find((x) => x.id === id);
  if (!c) return null;
  const homeQuota = (c.quota === 'HS') && c.state === i.home;
  const college = decorate(c, i, homeQuota);
  const rank = c.type === 'IIT' ? i.advRank : i.mainRank;
  return { college, chart: { years: ['2024'], vals: [c.close], rank } };
}
