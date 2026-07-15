import { describe, it, expect } from 'vitest';
import { listDoctor } from './doctor';
import type { Bucket } from './types';

const c = (bucket: Bucket) => ({ bucket });
const titles = (choices: { bucket: Bucket }[], ids: number[]) =>
  listDoctor(choices, ids).warnings.map((w) => w.title);

describe('listDoctor', () => {
  it('flags an empty list', () => {
    expect(titles([], [])).toEqual(['Empty list']);
  });

  it('flags no-safe + too-few, and counts buckets', () => {
    const choices = [c('target'), c('reach')];
    const r = listDoctor(choices, [2, 3]);
    expect(r.summary).toEqual({ total: 2, safe: 0, target: 1, reach: 1 });
    expect(r.warnings.map((w) => w.title)).toEqual(['No Safe colleges', 'Too few choices']);
  });

  it('flags reach-heavy top when ≥2 of the first 3 are reach', () => {
    const choices = [c('reach'), c('reach'), c('safe'), c('safe'), c('safe'), c('safe')];
    expect(titles(choices, [1, 2, 3, 4, 5, 6])).toContain('Reach-heavy at the top');
  });

  it('flags duplicates from the id list', () => {
    const choices = [c('safe'), c('safe'), c('target'), c('target'), c('safe'), c('safe')];
    expect(titles(choices, [1, 1, 2, 3, 4, 5])).toContain('Duplicate choices');
  });

  it('is healthy with a good spread and enough choices', () => {
    const choices = [c('safe'), c('safe'), c('target'), c('target'), c('reach'), c('safe')];
    expect(titles(choices, [1, 2, 3, 4, 5, 6])).toEqual(['List looks healthy']);
  });
});
