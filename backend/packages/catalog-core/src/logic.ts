// Predictor logic — the SAME math as the frontend's lib/logic.js, so results match.
// Returns SEMANTIC fields (bucket/label/pct) — the frontend maps them to colours.
import type { Offering, CollegeType } from './data';

export type Category = 'Open' | 'OBC-NCL' | 'SC' | 'ST' | 'EWS';
export type Bucket = 'safe' | 'target' | 'reach';
export type Sort = 'chance' | 'ranking' | 'closing' | 'location';

export interface PredictInput {
  advRank: number;
  mainRank: number;
  category: Category;
  home: string;
  types: CollegeType[];
  branch: string; // 'all' or a branch name
  state: string; // 'all' or a state
  q: string; // free-text search
  sort: Sort;
}

export interface Chance {
  ratio: number;
  bucket: Bucket;
  label: 'Safe' | 'Target' | 'Reach';
  pct: number;
  effClose: number;
}

export interface DecoratedOffering extends Offering, Chance {
  rankUsed: number;
  examLabel: string;
  feesTxt: string;
  avgTxt: string;
  homeQuota: boolean;
}

const rankFor = (o: Offering, i: Pick<PredictInput, 'advRank' | 'mainRank'>) =>
  o.exam === 'adv' ? i.advRank : i.mainRank;

/** Chance of admission from rank/closing-rank ratio, with home-state quota loosening. */
export function chance(o: Offering, i: PredictInput): Chance {
  const rank = rankFor(o, i);
  let close = o.close;
  if ((o.type === 'NIT' || o.type === 'GFTI') && o.state === i.home) close = Math.round(close * 1.35);
  const ratio = rank / close;
  let bucket: Bucket;
  let label: Chance['label'];
  if (ratio <= 0.9) { bucket = 'safe'; label = 'Safe'; }
  else if (ratio <= 1.15) { bucket = 'target'; label = 'Target'; }
  else { bucket = 'reach'; label = 'Reach'; }
  const pct = Math.max(8, Math.min(97, Math.round(102 - (ratio - 0.55) * 62)));
  return { ratio, bucket, label, pct, effClose: close };
}

export function decorate(o: Offering, i: PredictInput): DecoratedOffering {
  const ch = chance(o, i);
  return {
    ...o,
    ...ch,
    rankUsed: rankFor(o, i),
    examLabel: o.exam === 'adv' ? 'JEE Adv' : 'JEE Main',
    feesTxt: '₹' + o.fees + 'L total',
    avgTxt: '₹' + o.avg + ' LPA',
    homeQuota: (o.type === 'NIT' || o.type === 'GFTI') && o.state === i.home,
  };
}

export interface PredictResult {
  results: DecoratedOffering[];
  resultCount: number;
  safeCount: number;
  targetCount: number;
  reachCount: number;
}

/** Filtered + sorted predictor results over a dataset snapshot. */
export function predict(offerings: Offering[], i: PredictInput): PredictResult {
  let list = offerings.map((o) => decorate(o, i)).filter((c) => c.ratio <= 1.6);
  list = list.filter((c) => i.types.includes(c.type));
  if (i.branch && i.branch !== 'all') list = list.filter((c) => c.branch === i.branch);
  if (i.state && i.state !== 'all') list = list.filter((c) => c.state === i.state);
  if (i.q && i.q.trim()) {
    const q = i.q.toLowerCase();
    list = list.filter((c) => (c.college + ' ' + c.branch + ' ' + c.city).toLowerCase().includes(q));
  }
  if (i.sort === 'chance') list.sort((a, b) => b.pct - a.pct);
  else if (i.sort === 'ranking') list.sort((a, b) => (a.nirf || 99) - (b.nirf || 99));
  else if (i.sort === 'closing') list.sort((a, b) => a.close - b.close);
  else if (i.sort === 'location') list.sort((a, b) => a.city.localeCompare(b.city));
  return {
    results: list,
    resultCount: list.length,
    safeCount: list.filter((c) => c.bucket === 'safe').length,
    targetCount: list.filter((c) => c.bucket === 'target').length,
    reachCount: list.filter((c) => c.bucket === 'reach').length,
  };
}

/** Cutoff-trend chart geometry (5 years) with the student's rank marked. */
export function chartData(o: Offering, i: PredictInput) {
  const years = ['2021', '2022', '2023', '2024', '2025'];
  const base = o.close;
  const vals = [Math.round(base * 1.18), Math.round(base * 1.05), Math.round(base * 0.92), Math.round(base * 1.02), base];
  const rank = rankFor(o, i);
  return { years, vals, rank };
}

/** Defaults so a bare /predict call still works. */
export function normalizeInput(q: Record<string, string | undefined>): PredictInput {
  const types = (q.types ? q.types.split(',') : ['IIT', 'NIT', 'IIIT', 'GFTI']).filter(Boolean) as CollegeType[];
  return {
    advRank: Number(q.advRank) || 999999,
    mainRank: Number(q.mainRank) || 999999,
    category: (q.category as Category) || 'Open',
    home: q.home || '',
    types: types.length ? types : ['IIT', 'NIT', 'IIIT', 'GFTI'],
    branch: q.branch || 'all',
    state: q.state || 'all',
    q: q.q || '',
    sort: (q.sort as Sort) || 'chance',
  };
}
