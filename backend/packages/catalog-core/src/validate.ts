// Strict, typed validation of raw predictor query params.
//
// The predictor is a PUBLIC, CDN-cacheable endpoint whose output is a pure function of
// the query. Today `normalizeInput` (predict.ts) silently coerces anything — a bad rank
// becomes 9_999_999, an unknown category is cast through as-is — so garbage never errors
// and can quietly poison a cached response. This module is the single source of truth for
// what a valid query is: it parses + bounds-checks each field and reports issues, so the
// handler can reject clearly-invalid input with a 400 instead of caching nonsense.
//
// Implemented by the production-hardening build. The stub throws so an un-implemented
// version can never ship silently.
import type { Category, CollegeType, Sort } from './types';

export const CATEGORIES: readonly Category[] = ['Open', 'OBC-NCL', 'SC', 'ST', 'EWS'];
export const SORTS: readonly Sort[] = ['best', 'chance', 'safest', 'closing', 'location'];
export const COLLEGE_TYPES: readonly CollegeType[] = ['IIT', 'NIT', 'IIIT', 'GFTI'];

// A JEE rank past this is not a real counselling rank (pool never exceeds ~1.5M).
export const MAX_RANK = 2_000_000;

// Sentinel "no rank yet" value. A bare /predict (the UI's initial state) has no rank; we
// keep the historical default so every seat reads as a hopeless reach (and is hidden by the
// realistic window) rather than erroring. Must match predict()'s original coercion.
const UNRANKED = 9_999_999;
const DEFAULT_LIMIT = 300;
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
// Free-text search is bounded so a pathological query can't bloat the (cached) key/response.
const MAX_Q_LEN = 200;

export interface ValidationIssue { field: string; message: string }

/** A fully-validated predictor query (same shape predict() consumes). */
export interface ValidatedInput {
  advRank: number;
  mainRank: number;
  category: Category;
  home: string;
  gender: string;
  types: CollegeType[];
  q: string;
  sort: Sort;
  limit: number;
  applyWindow: boolean;
}

// A field is "present" only when it carries meaning; absent / blank / whitespace-only params
// fall back to a default and are NEVER reported as an error (a bare /predict is valid).
const present = (raw: string | undefined): raw is string => raw != null && raw.trim() !== '';

/** Positive whole-number rank. Absent ⇒ UNRANKED (no issue). Present-but-invalid ⇒ issue. */
function parseRank(raw: string | undefined, field: string, issues: ValidationIssue[]): number {
  if (!present(raw)) return UNRANKED;
  const s = raw.trim();
  // Ranks are positive integers; reject anything with a sign, decimal, or non-digit.
  if (!/^\d+$/.test(s)) {
    issues.push({ field, message: `${field} must be a positive whole number (got "${s}")` });
    return UNRANKED;
  }
  const n = Number(s);
  if (n <= 0) {
    issues.push({ field, message: `${field} must be at least 1` });
    return UNRANKED;
  }
  if (n > MAX_RANK) {
    issues.push({ field, message: `${field} must not exceed ${MAX_RANK} (got ${n})` });
    return UNRANKED;
  }
  return n;
}

/** One-of enum with a default; present-but-unknown ⇒ issue. */
function parseEnum<T extends string>(
  raw: string | undefined, field: string, allowed: readonly T[], fallback: T, issues: ValidationIssue[],
): T {
  if (!present(raw)) return fallback;
  const s = raw.trim();
  if ((allowed as readonly string[]).includes(s)) return s as T;
  issues.push({ field, message: `Unknown ${field} "${s}" (expected one of: ${allowed.join(', ')})` });
  return fallback;
}

/** Comma list of college types. Absent/blank ⇒ all four. Any unknown token ⇒ issue. */
function parseTypes(raw: string | undefined, issues: ValidationIssue[]): CollegeType[] {
  const all = [...COLLEGE_TYPES];
  if (!present(raw)) return all;
  const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return all; // e.g. "," / "  " — treat as "no filter"
  const out: CollegeType[] = [];
  const bad: string[] = [];
  for (const t of tokens) {
    if ((COLLEGE_TYPES as readonly string[]).includes(t)) {
      if (!out.includes(t as CollegeType)) out.push(t as CollegeType);
    } else {
      bad.push(t);
    }
  }
  if (bad.length) {
    issues.push({ field: 'types', message: `Unknown college type(s): ${bad.join(', ')} (expected: ${COLLEGE_TYPES.join(', ')})` });
  }
  return out.length ? out : all;
}

/** Result-cap. Absent ⇒ default; present numeric ⇒ clamp 1..500; present non-numeric ⇒ issue. */
function parseLimit(raw: string | undefined, issues: ValidationIssue[]): number {
  if (!present(raw)) return DEFAULT_LIMIT;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) {
    issues.push({ field: 'limit', message: `limit must be a number (got "${raw.trim()}")` });
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(n)));
}

/**
 * Validate raw query params into a typed, bounded predictor input. Returns the coerced value
 * plus any issues found; the caller decides whether to 400 (strict endpoints — see
 * normalizeInput) or best-effort. Absent optional fields default gracefully and never produce
 * an issue; only PRESENT-but-invalid fields (bad rank/limit, unknown category/sort/type) do.
 * Free-form fields (home/gender/q) are normalized leniently, not rejected.
 */
export function validateInput(
  q: Record<string, string | undefined>,
): { value: ValidatedInput; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const value: ValidatedInput = {
    advRank: parseRank(q.advRank, 'advRank', issues),
    mainRank: parseRank(q.mainRank, 'mainRank', issues),
    category: parseEnum(q.category, 'category', CATEGORIES, 'Open', issues),
    // Lenient free text: trim only, never reject — states arrive in many spellings and the
    // predictor matches them robustly downstream (normState in predict.ts).
    home: (q.home ?? '').trim(),
    gender: present(q.gender) ? q.gender.trim() : 'Gender-Neutral',
    types: parseTypes(q.types, issues),
    q: (q.q ?? '').trim().slice(0, MAX_Q_LEN),
    sort: parseEnum(q.sort, 'sort', SORTS, 'best', issues),
    limit: parseLimit(q.limit, issues),
    applyWindow: true, // predictor default; the profile route overrides to false post-normalize
  };
  return { value, issues };
}
