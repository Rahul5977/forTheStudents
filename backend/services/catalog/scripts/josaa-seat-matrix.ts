/**
 * josaa-seat-matrix.ts — acquire the OFFICIAL JoSAA seat matrix and write the College Data Hub
 * `seat-matrix` section for every roster institute.
 *
 * Source of truth: https://josaa.admissions.nic.in/applicant/seatmatrix/seatmatrixinfo.aspx
 * ("Seat Information" for the current JoSAA year). Like the ORCR archive (josaa-orcr.ts) it is an
 * ASP.NET WebForms page driven by cascading-dropdown postbacks:
 *
 *   GET page → ddlInstType=<code> → ddlInstitute=ALL → ddlBranch=ALL + btnSubmit
 *            → GridView1: one 2-row block per (institute, program, quota) — first <tr> carries
 *              institute/program/quota + the Gender-Neutral counts, second <tr> the Female-only counts.
 *
 * The page only ever shows the CURRENT year's matrix (no year dropdown), so `josaaYear` is read
 * from the page banner ("… for the Academic Year 2026-27" → 2026) and cross-checked with --year.
 *
 * Usage:
 *   pnpm --filter @sc/catalog exec tsx scripts/josaa-seat-matrix.ts               # fetch (cached) + write
 *   pnpm --filter @sc/catalog exec tsx scripts/josaa-seat-matrix.ts --force       # re-fetch every type
 *   pnpm --filter @sc/catalog exec tsx scripts/josaa-seat-matrix.ts --parse-only  # no network, use raw cache
 *   pnpm --filter @sc/catalog exec tsx scripts/josaa-seat-matrix.ts --types IIT,NIT
 *
 * Cache (resumable): data/josaa/seat-matrix/raw/<TYPE>.html (gitignored, ~MBs each) +
 *                    data/josaa/seat-matrix/manifest.json (provenance: sha256/bytes/fetchedAt/rows).
 * Output:            data/colleges/<instituteId>/seat-matrix.json — `null` for roster rows with
 *                    `inCutoffs:false` (own-entrance IIITs), otherwise the SeatMatrix contract.
 *
 * Rows with 0 seats in a cell are NOT emitted (the ORCR corpus has the same convention: a seat type
 * with no seats simply has no row). Nothing is ever invented: an unknown quota/gender label throws.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SeatMatrix, instituteId, deriveType, type RosterRow } from '@sc/catalog-core';
import { TYPES, type TypeKey } from './josaa-orcr';
import { loadRoster, collegesDir } from './hub-common';

const URL_SM = 'https://josaa.admissions.nic.in/applicant/seatmatrix/seatmatrixinfo.aspx';
const P = 'ctl00$ContentPlaceHolder1$';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '../data/josaa/seat-matrix');
const rawDir = join(cacheDir, 'raw');
const manifestPath = join(cacheDir, 'manifest.json');

type Quota = 'AI' | 'HS' | 'OS' | 'GO' | 'JK' | 'LA';
type Gender = 'GN' | 'F';
type SeatType =
  | 'OPEN' | 'OPEN (PwD)' | 'EWS' | 'EWS (PwD)' | 'OBC-NCL' | 'OBC-NCL (PwD)'
  | 'SC' | 'SC (PwD)' | 'ST' | 'ST (PwD)';

export interface MatrixRow {
  institute: string; // JoSAA spelling, whitespace-normalised
  program: string;
  quota: Quota;
  seatType: SeatType;
  gender: Gender;
  seats: number;
}

// ---------------------------------------------------------------- html helpers (mirror josaa-orcr.ts)
const unescape = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const strip = (s: string) => unescape(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function hiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const tag = m[0];
    const name = /name="([^"]+)"/.exec(tag)?.[1];
    const value = /value="([^"]*)"/.exec(tag)?.[1] ?? '';
    // GridView rows carry their own hidden inputs (hdfTotalSeat/hdfFemale) — never echo those back.
    if (name && !name.includes('GridView1')) out[name] = unescape(value);
  }
  return out;
}

function selectOptions(html: string, name: string): Array<{ value: string; text: string }> {
  const re = new RegExp(`<select[^>]*name="${name.replace(/\$/g, '\\$')}"[^>]*>([\\s\\S]*?)</select>`, 'i');
  const body = re.exec(html)?.[1];
  if (!body) return [];
  return [...body.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)]
    .map((m) => ({ value: m[1]!, text: strip(m[2]!) }));
}

class Session {
  private cookie = '';
  private fields: Record<string, string> = {};

  private mergeCookies(res: Response) {
    const raw = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const jar = new Map(this.cookie.split('; ').filter(Boolean).map((c) => [c.split('=')[0]!, c] as const));
    for (const sc of raw) { const pair = sc.split(';')[0]!; jar.set(pair.split('=')[0]!, pair); }
    this.cookie = [...jar.values()].join('; ');
  }

  private async request(body?: string): Promise<string> {
    const res = await fetch(URL_SM, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'User-Agent': UA, Referer: URL_SM, Origin: 'https://josaa.admissions.nic.in',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    this.mergeCookies(res);
    return res.text();
  }

  async open(): Promise<string> { this.fields = {}; return this.request(); }

  async select(html: string, target: string, extra: Record<string, string>): Promise<string> {
    Object.assign(this.fields, extra);
    const form = { ...hiddenFields(html), ...this.fields, __EVENTTARGET: target, __EVENTARGUMENT: '' };
    delete form[`${P}btnSubmit`];
    return this.request(new URLSearchParams(form).toString());
  }

  async submit(html: string, extra: Record<string, string>): Promise<string> {
    Object.assign(this.fields, extra);
    const form = { ...hiddenFields(html), ...this.fields, __EVENTTARGET: '', __EVENTARGUMENT: '', [`${P}btnSubmit`]: 'Submit' };
    return this.request(new URLSearchParams(form).toString());
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (err) {
      last = err;
      if (i === attempts) break;
      const wait = 3000 * 2 ** (i - 1);
      console.warn(`  ! ${label} attempt ${i}/${attempts} failed (${(err as Error).message}) — retry in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`${label}: ${(last as Error)?.message ?? last}`);
}

// ---------------------------------------------------------------- fetching
/** Drive the chain for one institute type and return the full results-page HTML. */
async function fetchType(type: TypeKey): Promise<string> {
  const code = TYPES[type].code;
  return withRetry(`seat matrix ${type}`, async () => {
    const s = new Session();
    let html = await s.open();
    const codes = selectOptions(html, `${P}ddlInstType`).map((o) => o.value);
    if (!codes.includes(code)) throw new Error(`instype ${code} not offered (have: ${codes.join(',')})`);
    html = await s.select(html, `${P}ddlInstType`, { [`${P}ddlInstType`]: code });
    await sleep(1000);
    const institutes = selectOptions(html, `${P}ddlInstitute`).filter((o) => o.value !== '0');
    if (!institutes.length) throw new Error('institute dropdown did not populate');
    html = await s.select(html, `${P}ddlInstitute`, { [`${P}ddlInstitute`]: '0' });
    await sleep(1000);
    const result = await s.submit(html, { [`${P}ddlBranch`]: '0' });
    if (!/id="GridView1"/.test(result)) throw new Error('no GridView1 in response');
    return result;
  });
}

// ---------------------------------------------------------------- parsing
/** "… for the Academic Year 2026-27" → 2026. */
export function pageYear(html: string): number | null {
  const m = /Academic\s+Year\s+(20\d{2})\s*-\s*\d{2}/i.exec(html);
  return m ? Number(m[1]) : null;
}

/**
 * Quota from the JoSAA cell: `lblQuota` label + the `lblstate1..8` spans.
 *   "All India"            → AI
 *   "Other than" + states  → OS   (seats for candidates from outside the listed states)
 *   ""  + states           → HS   (home-state seats for the listed state(s)) …
 *       except NIT Goa's single "GOA" block → GO (the ORCR corpus codes Goa-state seats as GO and the
 *       Daman/Diu/DNH/Lakshadweep block as HS — verified against josaa-2025.csv.gz)
 *   "JK" / "LA"            → JK / LA (NIT Srinagar; explicit labels)
 * Anything else throws — never guess a quota.
 */
function quotaFrom(label: string, states: string[]): Quota {
  const l = label.toLowerCase().replace(/\s+/g, ' ').trim();
  if (l === 'all india' || l === 'ai') return 'AI';
  if (l.startsWith('other than') || l === 'other state' || l === 'os') return 'OS';
  if (l === 'jk' || l.startsWith('jammu')) return 'JK';
  if (l === 'la' || l === 'ladakh') return 'LA';
  if (l === '' || l === 'home state' || l === 'hs') {
    if (states.length === 0) throw new Error('home-state block without any state listed');
    if (states.length === 1 && states[0]!.toUpperCase() === 'GOA') return 'GO';
    return 'HS';
  }
  throw new Error(`unknown quota label "${label}" (states: ${states.join(', ')}) — extend quotaFrom (never guess)`);
}
function genderOf(label: string): Gender {
  if (/^gender[- ]neutral$/i.test(label)) return 'GN';
  if (/^female[- ]only/i.test(label)) return 'F';
  throw new Error(`unknown gender label "${label}"`);
}

/** Column span-id → seat type (order = JoSAA's table order). */
const SEAT_COLS: Array<[string, SeatType]> = [
  ['lblOP', 'OPEN'], ['lblOP_PWD', 'OPEN (PwD)'],
  ['lblEW', 'EWS'], ['lblEW_PWD', 'EWS (PwD)'],
  ['lblSC', 'SC'], ['lblSC_PWD', 'SC (PwD)'],
  ['lblST', 'ST'], ['lblST_PWD', 'ST (PwD)'],
  ['lblBC', 'OBC-NCL'], ['lblBC_PWD', 'OBC-NCL (PwD)'],
];

function span(tr: string, id: string): string | undefined {
  const m = new RegExp(`<span[^>]*id="${id}"[^>]*>([\\s\\S]*?)</span>`, 'i').exec(tr);
  return m ? strip(m[1]!) : undefined;
}

/** Walk GridView1 and return one row per (institute, program, quota, gender, seatType) with seats > 0. */
export function parseGrid(html: string): { rows: MatrixRow[]; checksumErrors: string[] } {
  const start = html.indexOf('id="GridView1"');
  if (start < 0) throw new Error('GridView1 not found');
  const grid = html.slice(start);
  const rows: MatrixRow[] = [];
  const checksumErrors: string[] = [];
  let cur: { institute: string; program: string; quota: Quota } | null = null;

  // Top-level rows are the "\t\t\t<tr" siblings; nested tables use a different indentation, but we
  // split on every <tr and only act on rows that carry lblGender (data rows) — header/nested rows don't.
  for (const m of grid.matchAll(/<tr[^>]*>([\s\S]*?)(?=<tr[^>]*>|<\/table>\s*$)/gi)) {
    const tr = m[1]!;
    const gender = span(tr, 'lblGender');
    if (gender === undefined) continue;
    const name = span(tr, 'lblnm');
    if (name !== undefined) {
      const program = span(tr, 'lblAcademicProgram');
      const quota = span(tr, 'lblQuota');
      if (!program || quota === undefined) throw new Error(`block for "${name}" missing program/quota`);
      const states: string[] = [];
      for (let i = 1; i <= 8; i++) { const st = span(tr, `lblstate${i}`); if (st) states.push(st); }
      cur = { institute: name, program, quota: quotaFrom(quota, states) };
    }
    if (!cur) throw new Error('data row before any institute block');
    const g = genderOf(gender);
    let sum = 0;
    for (const [id, seatType] of SEAT_COLS) {
      const raw = span(tr, id);
      if (raw === undefined) throw new Error(`${cur.institute} / ${cur.program}: missing ${id}`);
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error(`${cur.institute} / ${cur.program}: bad count "${raw}" in ${id}`);
      sum += n;
      if (n > 0) rows.push({ ...cur, gender: g, seatType, seats: n });
    }
    const total = Number(span(tr, 'lblTotal') ?? NaN);
    if (Number.isFinite(total) && total !== sum) {
      checksumErrors.push(`${cur.institute} / ${cur.program} / ${cur.quota} / ${g}: cells sum ${sum} ≠ lblTotal ${total}`);
    }
  }
  return { rows, checksumErrors };
}

// ---------------------------------------------------------------- roster mapping
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function buildMapper(roster: RosterRow[]) {
  const byName = new Map<string, string>();
  const ids = new Set(roster.map((r) => r.id));
  for (const r of roster) for (const n of r.josaaNames) byName.set(norm(n), r.id);
  return (josaaName: string): string | null => {
    const exact = byName.get(norm(josaaName));
    if (exact) return exact;
    const derived = instituteId(josaaName, deriveType(josaaName));
    return ids.has(derived) ? derived : null;
  };
}

// ---------------------------------------------------------------- manifest
interface ManifestEntry {
  type: TypeKey; file: string; sha256: string; bytes: number; fetchedAt: string; source: string;
  josaaYear: number | null; rows: number; institutes: number;
}
function loadManifest(): Record<string, ManifestEntry> {
  return existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
}
function saveManifest(m: Record<string, ManifestEntry>) {
  writeFileSync(manifestPath, `${JSON.stringify(m, null, 2)}\n`);
}

// ---------------------------------------------------------------- cli
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const SEAT_ORDER = new Map(SEAT_COLS.map(([, t], i) => [t, i]));
const QUOTA_ORDER: Quota[] = ['AI', 'HS', 'OS', 'GO', 'JK', 'LA'];

async function main() {
  const types = (arg('types') ?? 'IIT,NIT,IIIT,GFTI').split(',').map((t) => t.trim()) as TypeKey[];
  for (const t of types) if (!(t in TYPES)) { console.error(`unknown type ${t}`); process.exit(1); }
  const force = flag('force');
  const parseOnly = flag('parse-only');
  const expectYear = arg('year') ? Number(arg('year')) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  mkdirSync(rawDir, { recursive: true });
  const manifest = loadManifest();
  const roster = loadRoster();
  const toId = buildMapper(roster);

  const all: Array<MatrixRow & { type: TypeKey }> = [];
  const years = new Set<number>();
  const unmapped = new Map<string, { type: TypeKey; rows: number }>();
  let failed = 0;

  for (const type of types) {
    const file = join(rawDir, `${type}.html`);
    let html: string | null = null;
    if (!force && existsSync(file)) {
      html = readFileSync(file, 'utf8');
      console.log(`= ${type}: raw cache (${(html.length / 1e6).toFixed(2)} MB)`);
    } else if (parseOnly) {
      console.error(`✗ ${type}: no raw cache and --parse-only given`); failed++; continue;
    } else {
      try {
        const t0 = Date.now();
        html = await fetchType(type);
        writeFileSync(file, html);
        console.log(`+ ${type}: fetched ${(html.length / 1e6).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (err) {
        console.error(`✗ ${type}: ${(err as Error).message}`); failed++; continue;
      }
      await sleep(1500);
    }

    const year = pageYear(html);
    if (year) years.add(year);
    const { rows, checksumErrors } = parseGrid(html);
    for (const e of checksumErrors) console.warn(`  ! checksum ${type}: ${e}`);
    const names = new Set(rows.map((r) => r.institute));
    console.log(`  ${type}: year ${year ?? '?'} · ${rows.length} rows · ${names.size} institutes · ${rows.reduce((s, r) => s + r.seats, 0)} seats`);
    manifest[type] = {
      type, file: `raw/${type}.html`, sha256: createHash('sha256').update(html).digest('hex'),
      bytes: Buffer.byteLength(html), fetchedAt: manifest[type]?.fetchedAt && !force && existsSync(file) ? manifest[type]!.fetchedAt : new Date().toISOString(),
      source: URL_SM, josaaYear: year, rows: rows.length, institutes: names.size,
    };
    saveManifest(manifest);
    for (const r of rows) all.push({ ...r, type });
  }

  if (years.size !== 1) {
    console.error(`✗ could not determine a single JoSAA year from the pages (saw: ${[...years].join(',') || 'none'})`);
    process.exit(1);
  }
  const josaaYear = [...years][0]!;
  if (expectYear && expectYear !== josaaYear) {
    console.error(`✗ page says JoSAA ${josaaYear} but --year ${expectYear} was requested`);
    process.exit(1);
  }

  // Group by roster id.
  const byId = new Map<string, Array<MatrixRow & { type: TypeKey }>>();
  for (const r of all) {
    const id = toId(r.institute);
    if (!id) {
      const u = unmapped.get(r.institute) ?? { type: r.type, rows: 0 };
      u.rows++; unmapped.set(r.institute, u);
      continue;
    }
    (byId.get(id) ?? byId.set(id, []).get(id)!).push(r);
  }

  // Write per-institute files.
  const summary = { written: 0, nulls: 0, missing: [] as string[] };
  const perType: Record<string, { institutes: number; rows: number; seats: number }> = {};
  for (const inst of roster) {
    const dir = join(collegesDir, inst.id);
    const out = join(dir, 'seat-matrix.json');
    if (!inst.inCutoffs) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(out, 'null\n');
      summary.nulls++;
      continue;
    }
    const rows = byId.get(inst.id);
    if (!rows?.length) { summary.missing.push(inst.id); continue; }
    const typesSeen = [...new Set(rows.map((r) => r.type))];
    const sorted = [...rows].sort((a, b) =>
      a.program.localeCompare(b.program) ||
      QUOTA_ORDER.indexOf(a.quota) - QUOTA_ORDER.indexOf(b.quota) ||
      (a.gender === b.gender ? 0 : a.gender === 'GN' ? -1 : 1) ||
      SEAT_ORDER.get(a.seatType)! - SEAT_ORDER.get(b.seatType)!,
    );
    const doc = {
      instituteId: inst.id,
      josaaYear,
      rows: sorted.map(({ program, quota, seatType, gender, seats }) => ({ program, quota, seatType, gender, seats })),
      sources: [
        {
          url: URL_SM,
          title: `JoSAA ${josaaYear} Seat Matrix — Seat Information (${typesSeen.map((t) => TYPES[t].label).join('; ')})`,
          publisher: 'JoSAA',
          accessedOn: today,
          asOf: String(josaaYear),
          confidence: 'official' as const,
        },
      ],
      asOf: String(josaaYear),
    };
    const parsed = SeatMatrix.safeParse(doc);
    if (!parsed.success) {
      console.error(`✗ ${inst.id}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      failed++; continue;
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
    summary.written++;
    const pt = (perType[inst.type] ??= { institutes: 0, rows: 0, seats: 0 });
    pt.institutes++; pt.rows += doc.rows.length; pt.seats += doc.rows.reduce((s, r) => s + r.seats, 0);
  }

  console.log(`\nJoSAA ${josaaYear} seat matrix → ${summary.written} institutes written, ${summary.nulls} null (own-entrance)`);
  for (const [t, v] of Object.entries(perType)) console.log(`  ${t}: ${v.institutes} institutes · ${v.rows} rows · ${v.seats} seats`);
  if (summary.missing.length) console.log(`  roster ids with NO rows: ${summary.missing.join(', ')}`);
  const unmappedRelevant = [...unmapped].filter(([n, u]) => u.type !== 'GFTI' || deriveType(n) !== 'GFTI');
  if (unmappedRelevant.length) {
    console.log(`  JoSAA names not mapped to a roster id (${unmappedRelevant.length}):`);
    for (const [n, u] of unmappedRelevant) console.log(`    [${u.type}] ${n} (${u.rows} rows)`);
  }
  const gftiOnly = [...unmapped].filter(([n, u]) => u.type === 'GFTI' && deriveType(n) === 'GFTI').length;
  if (gftiOnly) console.log(`  (+ ${gftiOnly} GFTI names outside the roster — expected)`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) void main();
