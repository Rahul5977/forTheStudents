// Real JoSAA cutoff types. Source: official JoSAA 2024 opening/closing ranks
// (IITs from the JIC ORCR report; NITs/IIITs/GFTIs webscraped from josaa.nic.in).
// A "Cutoff" = the opening/closing rank for one institute+program+quota+seat-type+gender.
export type CollegeType = 'IIT' | 'NIT' | 'IIIT' | 'GFTI';
export type Exam = 'adv' | 'main'; // IITs via JEE Advanced; the rest via JEE Main
export type Category = 'Open' | 'OBC-NCL' | 'SC' | 'ST' | 'EWS';
export type Bucket = 'safe' | 'target' | 'reach';
export type Sort = 'chance' | 'closing' | 'location';

export interface Cutoff {
  id: number;
  institute: string; // full official name
  program: string; // full program name
  branch: string; // short program (before " (")
  type: CollegeType;
  exam: Exam;
  quota: string; // AI | HS | OS | GO | JK | LA
  seatType: string; // OPEN | EWS | OBC-NCL | SC | ST | *(PwD)
  gender: string; // Gender-Neutral | Female-only...
  open: number; // opening rank
  close: number; // closing rank
}

export const DATASET_VERSION = 'josaa-2024';
