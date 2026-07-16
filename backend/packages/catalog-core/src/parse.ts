// Parse official JoSAA cutoffs into a unified Cutoff[]. Two CSV shapes are supported:
//   • josaa24.csv (7 cols): Institute, Program, Quota, Seat Type, Gender, Open, Close
//     → year/round come from the caller (defaults 2024, final round).
//   • history CSVs (9 cols): the same 7 + Year, Round (seshaljain/josaa-scrape schema).
//     → year/round are read per row.
// The header is inspected to decide which shape a file is, so one parser handles both.
import type { Cutoff, CollegeType, Exam } from './types';
import { enrich, instituteId } from './enrich';

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
const int = (s: string | undefined, fallback: number): number => {
  const n = Number(String(s ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export interface ParseOpts {
  /** Year to stamp when the file has no Year column (josaa24.csv). */
  defaultYear?: number;
  /** Round to stamp when the file has no Round column. */
  defaultRound?: number;
  /** First id to assign (lets a corpus keep ids globally unique across files). */
  startId?: number;
}

/** Does the header carry Year/Round columns (history shape)? Returns their indices (-1 if absent). */
function headerCols(header: string[]): { year: number; round: number } {
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name);
  return { year: idx('year'), round: idx('round') };
}

/** Parse one JoSAA CSV (either shape) → enriched Cutoff[]. */
export function parseCutoffs(text: string, opts: ParseOpts = {}): Cutoff[] {
  const { defaultYear = 2024, defaultRound = 6, startId = 1 } = opts;
  const out: Cutoff[] = [];
  let id = startId;
  const lines = text.split(/\r?\n/);
  const cols = headerCols(splitCsvLine(lines[0] ?? ''));
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const c = splitCsvLine(lines[i]!);
    if (c.length < 7) continue;
    const open = num(c[5]!); const close = num(c[6]!);
    if (open == null || close == null) continue;
    const institute = c[0]!;
    const type = deriveType(institute);
    const e = enrich(institute, type);
    const year = cols.year >= 0 ? int(c[cols.year], defaultYear) : defaultYear;
    const round = cols.round >= 0 ? int(c[cols.round], defaultRound) : defaultRound;
    out.push({
      id: id++, instituteId: instituteId(institute, type), institute, short: e.short,
      program: c[1]!, branch: shortBranch(c[1]!), type, exam: examFor(type),
      quota: c[2]!, seatType: c[3]!, gender: c[4]!, open, close, year, round,
      city: e.city, state: e.state, nirf: e.nirf, feesLakh: e.feesLakh,
    });
  }
  return out;
}

/** Parse a multi-file corpus into one Cutoff[] with globally-unique ids. */
export function parseCorpus(files: { text: string; year?: number; round?: number }[]): Cutoff[] {
  const out: Cutoff[] = [];
  for (const f of files) {
    const rows = parseCutoffs(f.text, { defaultYear: f.year, defaultRound: f.round, startId: out.length + 1 });
    out.push(...rows);
  }
  return out;
}

/** Back-compat name used by the seed. */
export const parseAll = (_orcrUnused: string, josaaText: string): Cutoff[] => parseCutoffs(josaaText);
