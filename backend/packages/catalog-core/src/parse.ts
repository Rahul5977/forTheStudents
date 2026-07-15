// Parse the official JoSAA 2024 cutoffs (josaa24.csv) into a unified Cutoff[].
// josaa24.csv covers ALL institutes (IITs + NITs + IIITs + GFTIs) with columns:
//   Institute, Academic Program Name, Quota, Seat Type, Gender, Opening Rank, Closing Rank
// (ORCR.csv is a duplicate IIT-only source and is intentionally NOT used.)
import type { Cutoff, CollegeType, Exam } from './types';
import { enrich } from './enrich';

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Classify by name. IIIT is checked BEFORE IIT ("Information Technology" ⊃ "Technology"). */
export function deriveType(institute: string): CollegeType {
  if (/Indian Institute of Information Technology|IIIT/i.test(institute)) return 'IIIT';
  if (/Indian Institute of Technology|^IIT\b/i.test(institute)) return 'IIT';
  if (/National Institute of Technology|^[MSV]?NIT\b|^MN?NIT\b/i.test(institute)) return 'NIT';
  return 'GFTI';
}
const examFor = (t: CollegeType): Exam => (t === 'IIT' ? 'adv' : 'main');
const shortBranch = (program: string) =>
  program.split(/\s*\(/)[0]!.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
const num = (s: string): number | null => {
  const n = Number(String(s).replace(/[^\d.]/g, '')); // strips "P" (prep ranks) etc.
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** Parse josaa24.csv (has header) → enriched Cutoff[]. */
export function parseCutoffs(text: string): Cutoff[] {
  const out: Cutoff[] = [];
  let id = 1;
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const c = splitCsvLine(lines[i]!);
    if (c.length < 7) continue;
    const open = num(c[5]!); const close = num(c[6]!);
    if (open == null || close == null) continue;
    const institute = c[0]!;
    const type = deriveType(institute);
    const e = enrich(institute, type);
    out.push({
      id: id++, institute, short: e.short, program: c[1]!, branch: shortBranch(c[1]!), type, exam: examFor(type),
      quota: c[2]!, seatType: c[3]!, gender: c[4]!, open, close,
      city: e.city, state: e.state, nirf: e.nirf, feesLakh: e.feesLakh,
    });
  }
  return out;
}

/** Back-compat name used by the seed. */
export const parseAll = (_orcrUnused: string, josaaText: string): Cutoff[] => parseCutoffs(josaaText);
