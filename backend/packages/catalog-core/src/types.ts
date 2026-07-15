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
  city: string;
  state: string; // drives Home-State quota
  nirf: number | null; // NIRF 2024 rank where officially ranked
  feesLakh: number; // approx total B.Tech fees (₹ lakh)
}

// Bump on each re-ingest (immutable versions; the predictor reads the active one).
export const DATASET_VERSION = 'josaa-2024.2';
