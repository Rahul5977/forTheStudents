/**
 * josaa-orcr.ts — acquire JoSAA Opening/Closing-Rank data from the OFFICIAL source.
 *
 * Source of truth: https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx
 * ("Archive of Opening and Closing Rank"). It is an ASP.NET WebForms page with cascading
 * dropdowns, so each query is a stateful postback chain, not a REST call:
 *
 *   GET page → ddlYear → ddlroundno → ddlInstype → ddlInstitute=ALL → ddlBranch=ALL
 *            → ddlSeatType=ALL + btnSubmit → one HTML table with every row for that partition.
 *
 * A "partition" is one (year, round, instituteType) triple. Partitions are immutable once
 * JoSAA publishes them, which is why we materialize to CSV on disk instead of querying live.
 *
 * Usage:
 *   tsx scripts/josaa-orcr.ts --type IIT --from 2020 --to 2025
 *   tsx scripts/josaa-orcr.ts --type NIT --from 2020 --to 2025 --force
 *   tsx scripts/josaa-orcr.ts --list-rounds --from 2020 --to 2025
 *
 * Output (schema is the repo's existing 9-col history shape, drop-in for parse.ts):
 *   data/josaa/csv/josaa-<year>-r<round>-<TYPE>.csv
 *   data/josaa/manifest-<TYPE>.json   (per-type so parallel type runs never race)
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const URL_ORCR =
  'https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx';
const P = 'ctl00$ContentPlaceHolder1$';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** JoSAA's own institute-type codes → the repo's CollegeType names. */
export const TYPES = {
  IIT: { code: 'IIT', label: 'Indian Institute of Technology' },
  NIT: { code: 'NIT', label: 'National Institute of Technology' },
  IIIT: { code: '3IT', label: 'Indian Institute of Information Technology' },
  GFTI: { code: 'CFI', label: 'Government Funded Technical Institutions' },
} as const;
export type TypeKey = keyof typeof TYPES;

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data/josaa');
const csvDir = join(dataDir, 'csv');

// ---------------------------------------------------------------- html helpers
const unescape = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const strip = (s: string) => unescape(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** All <input type=hidden> — carries __VIEWSTATE/__EVENTVALIDATION, which every postback must echo. */
function hiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const tag = m[0];
    const name = /name="([^"]+)"/.exec(tag)?.[1];
    const value = /value="([^"]*)"/.exec(tag)?.[1] ?? '';
    if (name) out[name] = unescape(value);
  }
  return out;
}

function selectOptions(html: string, name: string): Array<{ value: string; text: string }> {
  const re = new RegExp(`<select[^>]*name="${name.replace(/\$/g, '\\$')}"[^>]*>([\\s\\S]*?)</select>`, 'i');
  const body = re.exec(html)?.[1];
  if (!body) return [];
  return [...body.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)]
    .map((m) => ({ value: m[1]!, text: strip(m[2]!) }))
    .filter((o) => o.value !== '0' && o.value !== '');
}

// ---------------------------------------------------------------- session
/** One cookie-bearing session against the ASPX page. ASP.NET keys state to the session cookie. */
class Session {
  private cookie = '';
  private fields: Record<string, string> = {};

  private mergeCookies(res: Response) {
    const raw = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const jar = new Map(
      this.cookie.split('; ').filter(Boolean).map((c) => [c.split('=')[0]!, c] as const),
    );
    for (const sc of raw) {
      const pair = sc.split(';')[0]!;
      jar.set(pair.split('=')[0]!, pair);
    }
    this.cookie = [...jar.values()].join('; ');
  }

  private async request(body?: string): Promise<string> {
    const res = await fetch(URL_ORCR, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'User-Agent': UA,
        Referer: URL_ORCR,
        Origin: 'https://josaa.admissions.nic.in',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    this.mergeCookies(res);
    return res.text();
  }

  /** Fresh page load; resets the accumulated dropdown selections. */
  async open(): Promise<string> {
    this.fields = {};
    return this.request();
  }

  /**
   * Fire one cascading-dropdown postback. `extra` is merged into the running selection set,
   * because WebForms expects every already-chosen dropdown to be posted back each time.
   */
  async select(html: string, target: string, extra: Record<string, string>): Promise<string> {
    Object.assign(this.fields, extra);
    const form = { ...hiddenFields(html), ...this.fields, __EVENTTARGET: target, __EVENTARGUMENT: '' };
    delete form[`${P}btnSubmit`];
    return this.request(new URLSearchParams(form).toString());
  }

  /** Final Submit — returns the results-table HTML. */
  async submit(html: string, extra: Record<string, string>): Promise<string> {
    Object.assign(this.fields, extra);
    const form = {
      ...hiddenFields(html), ...this.fields,
      __EVENTTARGET: '', __EVENTARGUMENT: '', [`${P}btnSubmit`]: 'Submit',
    };
    return this.request(new URLSearchParams(form).toString());
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry with exponential backoff — the NIC host intermittently drops long-running POSTs. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (err) {
      last = err;
      if (i === attempts) break;
      const wait = 2000 * 2 ** (i - 1);
      console.warn(`  ! ${label} attempt ${i}/${attempts} failed (${(err as Error).message}) — retry in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`${label}: ${(last as Error)?.message ?? last}`);
}

// ---------------------------------------------------------------- fetching
/** Rounds JoSAA actually published for a year (varies: 5, 6 or 7). */
export async function roundsFor(year: number): Promise<string[]> {
  return withRetry(`rounds ${year}`, async () => {
    const s = new Session();
    let html = await s.open();
    html = await s.select(html, `${P}ddlYear`, { [`${P}ddlYear`]: String(year) });
    return selectOptions(html, `${P}ddlroundno`).map((o) => o.value);
  });
}

export interface Partition { year: number; round: string; type: TypeKey; }

/** Drive the full chain for one partition and return its parsed data rows. */
export async function fetchPartition(p: Partition): Promise<string[][]> {
  const code = TYPES[p.type].code;
  return withRetry(`${p.year} R${p.round} ${p.type}`, async () => {
    const s = new Session();
    let html = await s.open();
    html = await s.select(html, `${P}ddlYear`, { [`${P}ddlYear`]: String(p.year) });
    html = await s.select(html, `${P}ddlroundno`, { [`${P}ddlroundno`]: p.round });

    const types = selectOptions(html, `${P}ddlInstype`).map((o) => o.value);
    if (!types.includes(code)) throw new Error(`instype ${code} not offered (have: ${types.join(',')})`);
    html = await s.select(html, `${P}ddlInstype`, { [`${P}ddlInstype`]: code });
    html = await s.select(html, `${P}ddlInstitute`, { [`${P}ddlInstitute`]: 'ALL' });
    html = await s.select(html, `${P}ddlBranch`, { [`${P}ddlBranch`]: 'ALL' });
    const result = await s.submit(html, { [`${P}ddlSeatType`]: 'ALL' });

    const rows = parseResultTable(result);
    if (!rows.length) throw new Error('empty result table');
    return rows;
  });
}

/** Extract the 7-column data rows from the results table, skipping the header row. */
export function parseResultTable(html: string): string[][] {
  const out: string[][] = [];
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]!));
    if (cells.length < 7) continue;
    if (/^institute$/i.test(cells[0]!)) continue;        // header
    if (!/^\d+P?$/.test(cells[6]!.replace(/\s/g, ''))) continue; // guard: closing rank must be numeric
    out.push(cells.slice(0, 7));
  }
  return out;
}

// ---------------------------------------------------------------- csv + manifest
const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const CSV_HEADER =
  'Institute,Academic Program Name,Quota,Seat Type,Gender,Opening Rank,Closing Rank,Year,Round';

export function toCsv(rows: string[][], year: number, round: string): string {
  const body = rows.map((r) => [...r, String(year), round].map(q).join(',')).join('\n');
  return `${CSV_HEADER}\n${body}\n`;
}

interface ManifestEntry {
  file: string; year: number; round: string; type: TypeKey;
  rows: number; institutes: number; programs: number;
  sha256: string; bytes: number; fetchedAt: string; source: string;
}

function manifestPath(type: TypeKey) { return join(dataDir, `manifest-${type}.json`); }

function loadManifest(type: TypeKey): Record<string, ManifestEntry> {
  const p = manifestPath(type);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

function saveManifest(type: TypeKey, m: Record<string, ManifestEntry>) {
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath(type), `${JSON.stringify(sorted, null, 2)}\n`);
}

// ---------------------------------------------------------------- cli
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const from = Number(arg('from') ?? 2020);
  const to = Number(arg('to') ?? 2025);
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  if (flag('list-rounds')) {
    for (const y of years) console.log(`${y}: rounds ${(await roundsFor(y)).join(',') || '(none)'}`);
    return;
  }

  const type = arg('type') as TypeKey | undefined;
  if (!type || !(type in TYPES)) {
    console.error(`--type must be one of: ${Object.keys(TYPES).join(', ')}`);
    process.exit(1);
  }
  const only = arg('round');
  const force = flag('force');
  mkdirSync(csvDir, { recursive: true });
  const manifest = loadManifest(type);

  console.log(`▶ ${type} (${TYPES[type].code}) · ${from}–${to}${only ? ` · round ${only}` : ''}`);
  let fetched = 0, skipped = 0, failed = 0, total = 0;

  for (const year of years) {
    const rounds = only ? [only] : await roundsFor(year);
    if (!rounds.length) { console.log(`  ${year}: no rounds published — skip`); continue; }

    for (const round of rounds) {
      const file = `josaa-${year}-r${round}-${type}.csv`;
      const key = `${year}-r${round}`;
      if (!force && manifest[key] && existsSync(join(csvDir, file))) {
        total += manifest[key]!.rows; skipped++;
        console.log(`  = ${file} (cached, ${manifest[key]!.rows} rows)`);
        continue;
      }
      try {
        const t0 = Date.now();
        const rows = await fetchPartition({ year, round, type });
        const csv = toCsv(rows, year, round);
        writeFileSync(join(csvDir, file), csv);
        manifest[key] = {
          file, year, round, type,
          rows: rows.length,
          institutes: new Set(rows.map((r) => r[0])).size,
          programs: new Set(rows.map((r) => `${r[0]}|${r[1]}`)).size,
          sha256: createHash('sha256').update(csv).digest('hex'),
          bytes: Buffer.byteLength(csv),
          fetchedAt: new Date().toISOString(),
          source: URL_ORCR,
        };
        saveManifest(type, manifest);
        total += rows.length; fetched++;
        console.log(`  + ${file} — ${rows.length} rows, ${manifest[key]!.institutes} institutes (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (err) {
        failed++;
        console.error(`  ✗ ${year} R${round} ${type}: ${(err as Error).message}`);
      }
      await sleep(1200); // be polite to a government host
    }
  }
  console.log(`\n${type}: ${fetched} fetched, ${skipped} cached, ${failed} failed · ${total} rows total`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) void main();
