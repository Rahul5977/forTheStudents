// Parse the two official JoSAA 2024 CSVs into a unified Cutoff[].
//   ORCR.csv    (IITs)          : institute, program, seatType, gender, open, close   (quota = AI)
//   josaa24.csv (NIT/IIIT/GFTI) : institute, program, quota, seatType, gender, open, close  (has header)
import type { Cutoff, CollegeType, Exam } from './types';

/** Minimal CSV row splitter that respects double-quoted fields. */
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

export function deriveType(institute: string): CollegeType {
  if (/^IIT\b/.test(institute)) return 'IIT';
  if (/National Institute of Technology|^NIT\b|^[MSV]?NIT\b|^MNNIT\b|Malaviya|Motilal|Sardar Vallabhbhai National|Visvesvaraya National/.test(institute)) return 'NIT';
  if (/Indian Institute of Information Technology|IIIT/.test(institute)) return 'IIIT';
  return 'GFTI';
}
const examFor = (t: CollegeType): Exam => (t === 'IIT' ? 'adv' : 'main');
const shortBranch = (program: string) =>
  program
    .split(/\s*\(/)[0]!
    .replace(/([a-z])([A-Z])/g, '$1 $2') // fix source concatenations e.g. "CommunicationEngineering"
    .replace(/\s+/g, ' ')
    .trim();
const num = (s: string): number | null => {
  const n = Number(String(s).replace(/[^\d.]/g, '')); // strips "P" (prep ranks) etc.
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** IIT ORCR file (no header, no quota column). */
function parseOrcr(text: string, start: number): Cutoff[] {
  const out: Cutoff[] = [];
  let id = start;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = splitCsvLine(line);
    if (c.length < 6) continue;
    const open = num(c[4]!); const close = num(c[5]!);
    if (open == null || close == null) continue;
    const type: CollegeType = 'IIT';
    out.push({ id: id++, institute: c[0]!, program: c[1]!, branch: shortBranch(c[1]!), type, exam: examFor(type), quota: 'AI', seatType: c[2]!, gender: c[3]!, open, close });
  }
  return out;
}

/** JoSAA scrape (has header + quota column). */
function parseJosaa(text: string, start: number): Cutoff[] {
  const out: Cutoff[] = [];
  let id = start;
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) { // skip header
    if (!lines[i]!.trim()) continue;
    const c = splitCsvLine(lines[i]!);
    if (c.length < 7) continue;
    const open = num(c[5]!); const close = num(c[6]!);
    if (open == null || close == null) continue;
    const type = deriveType(c[0]!);
    out.push({ id: id++, institute: c[0]!, program: c[1]!, branch: shortBranch(c[1]!), type, exam: examFor(type), quota: c[2]!, seatType: c[3]!, gender: c[4]!, open, close });
  }
  return out;
}

/** Combine both official files into one dataset (IITs + NITs + IIITs + GFTIs). */
export function parseAll(orcrText: string, josaaText: string): Cutoff[] {
  const iits = parseOrcr(orcrText, 1);
  const rest = parseJosaa(josaaText, iits.length + 1);
  return [...iits, ...rest];
}
