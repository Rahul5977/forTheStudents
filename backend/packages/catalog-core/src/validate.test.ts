import { describe, it, expect } from 'vitest';
import { validateInput, MAX_RANK, CATEGORIES, SORTS, COLLEGE_TYPES } from './validate';

// validateInput is the single source of truth for a valid predictor query: it coerces every
// field to a typed, bounded value and reports issues for anything PRESENT-but-invalid. Absent
// optional fields default gracefully and must never produce an issue.
const ALL_TYPES = [...COLLEGE_TYPES];

describe('validateInput — defaults (absent fields never error)', () => {
  it('bare query → graceful unranked defaults, no issues', () => {
    const { value, issues } = validateInput({});
    expect(issues).toEqual([]);
    expect(value).toEqual({
      advRank: 9_999_999,
      mainRank: 9_999_999,
      category: 'Open',
      home: '',
      gender: 'Gender-Neutral',
      types: ALL_TYPES,
      q: '',
      sort: 'best',
      limit: 300,
      applyWindow: true,
    });
  });

  it('blank / whitespace-only params are treated as absent (no issue)', () => {
    const { value, issues } = validateInput({ advRank: '', mainRank: '   ', category: '', sort: '', types: '', limit: '', q: '  ', home: '', gender: '' });
    expect(issues).toEqual([]);
    expect(value.advRank).toBe(9_999_999);
    expect(value.category).toBe('Open');
    expect(value.sort).toBe('best');
    expect(value.types).toEqual(ALL_TYPES);
    expect(value.limit).toBe(300);
    expect(value.gender).toBe('Gender-Neutral');
  });

  it('only mainRank supplied → advRank stays unranked, no issue (NIT-only student)', () => {
    const { value, issues } = validateInput({ mainRank: '1400' });
    expect(issues).toEqual([]);
    expect(value.mainRank).toBe(1400);
    expect(value.advRank).toBe(9_999_999);
  });
});

describe('validateInput — valid passthrough', () => {
  it('a fully-specified valid query passes through unchanged', () => {
    const { value, issues } = validateInput({
      advRank: '850', mainRank: '4200', category: 'OBC-NCL', home: 'Delhi',
      gender: 'Female-only (including Supernumerary)', types: 'IIT,NIT', q: 'computer', sort: 'chance', limit: '50',
    });
    expect(issues).toEqual([]);
    expect(value).toEqual({
      advRank: 850, mainRank: 4200, category: 'OBC-NCL', home: 'Delhi',
      gender: 'Female-only (including Supernumerary)', types: ['IIT', 'NIT'], q: 'computer', sort: 'chance', limit: 50,
      applyWindow: true,
    });
  });

  it('every known category / sort is accepted', () => {
    for (const category of CATEGORIES) expect(validateInput({ category }).issues).toEqual([]);
    for (const sort of SORTS) expect(validateInput({ sort }).issues).toEqual([]);
  });
});

describe('validateInput — rank bounds', () => {
  it('accepts the inclusive boundaries 1 and MAX_RANK', () => {
    expect(validateInput({ advRank: '1' }).issues).toEqual([]);
    expect(validateInput({ advRank: '1' }).value.advRank).toBe(1);
    expect(validateInput({ mainRank: String(MAX_RANK) }).issues).toEqual([]);
    expect(validateInput({ mainRank: String(MAX_RANK) }).value.mainRank).toBe(MAX_RANK);
  });

  it('rejects rank just past MAX_RANK', () => {
    const { issues } = validateInput({ advRank: String(MAX_RANK + 1) });
    expect(issues.map((i) => i.field)).toContain('advRank');
  });

  it('rejects rank 0 and negative rank', () => {
    expect(validateInput({ mainRank: '0' }).issues.map((i) => i.field)).toContain('mainRank');
    expect(validateInput({ mainRank: '-1' }).issues.map((i) => i.field)).toContain('mainRank');
  });

  it('rejects non-numeric and non-integer ranks, naming the field', () => {
    for (const bad of ['abc', '12.5', '1e5', '+850', ' 8 5 0 ']) {
      const { issues } = validateInput({ advRank: bad });
      expect(issues.some((i) => i.field === 'advRank')).toBe(true);
    }
  });
});

describe('validateInput — enums', () => {
  it('rejects an unknown category and names the field', () => {
    const { issues } = validateInput({ category: 'General' });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe('category');
  });

  it('rejects an unknown sort', () => {
    const { issues } = validateInput({ sort: 'cheapest' });
    expect(issues.map((i) => i.field)).toEqual(['sort']);
  });
});

describe('validateInput — types list', () => {
  it('parses a valid comma list and de-dups while preserving order', () => {
    const { value, issues } = validateInput({ types: 'NIT,IIT,NIT' });
    expect(issues).toEqual([]);
    expect(value.types).toEqual(['NIT', 'IIT']);
  });

  it('empty / punctuation-only list falls back to all four (no issue)', () => {
    expect(validateInput({ types: ',' }).value.types).toEqual(ALL_TYPES);
    expect(validateInput({ types: ' , ' }).issues).toEqual([]);
  });

  it('rejects an unknown college type token, listing the bad token(s)', () => {
    const { issues } = validateInput({ types: 'IIT,FOO' });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe('types');
    expect(issues[0]!.message).toContain('FOO');
  });
});

describe('validateInput — limit clamping', () => {
  it('clamps a present numeric limit to 1..500 without erroring', () => {
    expect(validateInput({ limit: '1000' }).value.limit).toBe(500);
    expect(validateInput({ limit: '0' }).value.limit).toBe(1);
    expect(validateInput({ limit: '-5' }).value.limit).toBe(1);
    expect(validateInput({ limit: '42' }).value.limit).toBe(42);
    expect(validateInput({ limit: '1000' }).issues).toEqual([]);
  });

  it('rejects a non-numeric limit', () => {
    const { issues } = validateInput({ limit: 'lots' });
    expect(issues.map((i) => i.field)).toEqual(['limit']);
  });
});

describe('validateInput — lenient free-text fields', () => {
  it('trims home but never rejects free-form state text', () => {
    const { value, issues } = validateInput({ home: '  Jammu & Kashmir  ' });
    expect(issues).toEqual([]);
    expect(value.home).toBe('Jammu & Kashmir');
  });

  it('passes gender through (trimmed), no enum enforcement', () => {
    expect(validateInput({ gender: '  Gender-Neutral ' }).value.gender).toBe('Gender-Neutral');
    expect(validateInput({ gender: 'anything-goes' }).issues).toEqual([]);
  });

  it('trims and caps the free-text query', () => {
    const { value } = validateInput({ q: '  ' + 'x'.repeat(500) + '  ' });
    expect(value.q.length).toBe(200);
  });
});

describe('validateInput — reports every bad field at once', () => {
  it('collects independent issues across fields', () => {
    const { issues } = validateInput({ advRank: '0', category: 'General', sort: 'cheapest', types: 'FOO', limit: 'lots' });
    const fields = new Set(issues.map((i) => i.field));
    expect(fields).toEqual(new Set(['advRank', 'category', 'sort', 'types', 'limit']));
  });
});
