// Real JoSAA cutoff types. Source: official JoSAA 2024 opening/closing ranks
// (IITs from the JIC ORCR report; NITs/IIITs/GFTIs webscraped from josaa.nic.in).
// A "Cutoff" = the opening/closing rank for one institute+program+quota+seat-type+gender.
export type CollegeType = 'IIT' | 'NIT' | 'IIIT' | 'GFTI';
export type Exam = 'adv' | 'main'; // IITs via JEE Advanced; the rest via JEE Main
export type Category = 'Open' | 'OBC-NCL' | 'SC' | 'ST' | 'EWS';
export type Bucket = 'safe' | 'target' | 'reach';
// 'best'   → default: best reachable colleges first (closing ASC, NIRF asc, chance desc)
// 'chance' / 'safest' → old behavior: highest chance % first (floats safe backups up)
// 'closing' → closing rank ascending; 'location' → by display name
export type Sort = 'best' | 'chance' | 'safest' | 'closing' | 'location';

export interface Cutoff {
  id: number;
  instituteId: string; // canonical, name-churn-stable slug, e.g. "iit-bombay" (the join key)
  institute: string; // full official name
  short: string; // display name, e.g. "IIT Bombay"
  program: string; // full program name
  branch: string; // short program (before " (")
  type: CollegeType;
  exam: Exam;
  quota: string; // AI | HS | OS | GO | JK | LA
  seatType: string; // OPEN | EWS | OBC-NCL | SC | ST | *(PwD)
  gender: string; // Gender-Neutral | Female-only...
  open: number; // opening rank
  close: number; // closing rank
  year: number; // counselling year, e.g. 2024
  round: number; // counselling round the snapshot is from (final round per year)
  city: string;
  state: string; // drives Home-State quota
  nirf: number | null; // NIRF 2024 rank where officially ranked
  feesLakh: number; // approx total B.Tech fees (₹ lakh)
}

// Bump on each re-ingest (immutable versions; the predictor reads the active one).
// josaa-2026f = the multi-year corpus with precomputed 2026 forecast bands.
// .2 = deepened with the acquired 2021–2023 final-round history (2020→2024 gap filled);
//      backtest median error 39.6%→13.2% vs .1. See docs/forecast-data-acquisition.md.
export const DATASET_VERSION = 'josaa-2026f.2';

// A precomputed forecast band for one seat (rank-INDEPENDENT). Computed at seed time by
// @sc/forecast and stored on the current-year row, so runtime never recomputes and never
// needs the raw history in memory. Plain data — catalog-core stays engine-free.
export interface ForecastBand {
  targetYear: number; // e.g. 2026
  predicted: number; // R̂ — forecast closing rank
  low: number; // optimistic bound (smaller rank)
  high: number; // pessimistic bound (larger rank)
  sigmaRank: number; // 1σ in rank space (drives the per-rank chance %)
  confidence: 'high' | 'medium' | 'low';
  limitedHistory: boolean;
  nPoints: number; // years of history the forecast used
}

// A current-year cutoff augmented with its forecast band + the closing-rank history
// (for the trend chart). This is what the catalog table actually stores.
export interface EnrichedCutoff extends Cutoff {
  forecast?: ForecastBand;
  history?: { year: number; close: number }[]; // ascending; the observed trend
}

// A forecast series is one seat pool over time — the substrate for @sc/forecast.
// Key: (instituteId, program, seatType, quota, gender). Values: closing rank per year.
export interface SeriesPoint { year: number; round: number; open: number; close: number }
export interface CutoffSeries {
  key: string; // `${instituteId}|${program}|${seatType}|${quota}|${gender}`
  instituteId: string;
  institute: string;
  short: string;
  program: string;
  branch: string;
  type: CollegeType;
  seatType: string;
  quota: string;
  gender: string;
  city: string;
  state: string;
  nirf: number | null;
  points: SeriesPoint[]; // sorted by year ascending, at most one per year (final round)
}
