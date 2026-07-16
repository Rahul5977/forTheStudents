// Phase 0/1: canonical institute identity + multi-year series building.
import { describe, it, expect } from 'vitest';
import { instituteId } from './enrich';
import { parseCutoffs, parseCorpus } from './parse';
import { distinctInstitutes, buildSeries, seriesForInstitute, latestYear } from './institutes';

const H = 'Institute,Academic Program Name,Quota,Seat Type,Gender,Opening Rank,Closing Rank';
const HYR = H + ',Year,Round';

describe('canonical instituteId', () => {
  it('is a stable slug from the curated short name', () => {
    expect(instituteId('Indian Institute of Technology Bombay', 'IIT')).toBe('iit-bombay');
    expect(instituteId('National Institute of Technology, Tiruchirappalli', 'NIT')).toBe('nit-trichy');
  });

  it('is deterministic — same official name always yields the same id', () => {
    // Real JoSAA names are stable across years (verified in the 2018–2024 corpus),
    // so a deterministic derivation is what keeps a series joined across years.
    const name = 'Indian Institute of Technology Bombay';
    expect(instituteId(name, 'IIT')).toBe(instituteId(name, 'IIT'));
  });

  it('distinguishes IIT vs NIT in the same city (type-aware signature match)', () => {
    // Regression: "National Institute of Technology Delhi" contains "Technology Delhi"
    // and used to collide with the IIT Delhi curated row (→ wrong NIRF/city/fees and a
    // merged series). The type guard in enrich() keeps them distinct.
    expect(instituteId('Indian Institute of Technology Delhi', 'IIT')).toBe('iit-delhi');
    expect(instituteId('National Institute of Technology Delhi', 'NIT')).toBe('nit-delhi');
  });
});

describe('parse stamps year/round/instituteId', () => {
  it('reads Year/Round columns when present (history shape)', () => {
    const rows = parseCutoffs(
      HYR + '\nIndian Institute of Technology Bhubaneswar,"Civil Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,8816,11238,2020,6',
    );
    expect(rows[0]!.year).toBe(2020);
    expect(rows[0]!.round).toBe(6);
    expect(rows[0]!.instituteId).toBe('iit-bhubaneswar');
  });

  it('defaults year/round when absent (josaa24 shape)', () => {
    const rows = parseCutoffs(
      H + '\nIndian Institute of Technology Bombay,"Computer Science and Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,63,68',
      { defaultYear: 2024, defaultRound: 6 },
    );
    expect(rows[0]!.year).toBe(2024);
    expect(rows[0]!.round).toBe(6);
  });
});

describe('parseCorpus + series building', () => {
  const cse = 'Computer Science and Engineering (4 Years, Bachelor of Technology)';
  const row = (close: number, year: number, round: number) =>
    `Indian Institute of Technology Bombay,"${cse}",AI,OPEN,Gender-Neutral,1,${close},${year},${round}`;
  const corpus = parseCorpus([
    { text: HYR + '\n' + row(70, 2022, 6) },
    { text: HYR + '\n' + row(66, 2023, 6) + '\n' + row(80, 2023, 3) /* earlier round, ignored */ },
    { text: HYR + '\n' + row(68, 2024, 6) },
  ]);

  it('assigns globally-unique ids across files', () => {
    const ids = corpus.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('latestYear picks the newest year', () => {
    expect(latestYear(corpus)).toBe(2024);
  });

  it('buildSeries keeps one point per year (final round), sorted ascending', () => {
    const series = buildSeries(corpus);
    expect(series).toHaveLength(1);
    const pts = series[0]!.points;
    expect(pts.map((p) => p.year)).toEqual([2022, 2023, 2024]);
    // 2023 has two rounds — the FINAL round (6, close 66) wins over round 3 (close 80).
    expect(pts.find((p) => p.year === 2023)!.close).toBe(66);
    expect(series[0]!.instituteId).toBe('iit-bombay');
  });

  it('seriesForInstitute filters to one institute', () => {
    expect(seriesForInstitute(corpus, 'iit-bombay')).toHaveLength(1);
    expect(seriesForInstitute(corpus, 'nit-trichy')).toHaveLength(0);
  });
});

describe('distinctInstitutes', () => {
  it('collapses multi-year rows into one entry per institute with year coverage', () => {
    const cse = 'Computer Science and Engineering (4 Years, Bachelor of Technology)';
    const ee = 'Electrical Engineering (4 Years, Bachelor of Technology)';
    const corpus = parseCorpus([
      { text: HYR + `\nIndian Institute of Technology Bombay,"${cse}",AI,OPEN,Gender-Neutral,1,68,2023,6` },
      { text: HYR + `\nIndian Institute of Technology Bombay,"${cse}",AI,OPEN,Gender-Neutral,1,66,2024,6`
                  + `\nIndian Institute of Technology Bombay,"${ee}",AI,OPEN,Gender-Neutral,1,700,2024,6` },
    ]);
    const insts = distinctInstitutes(corpus);
    expect(insts).toHaveLength(1);
    expect(insts[0]!.id).toBe('iit-bombay');
    expect(insts[0]!.years).toEqual([2023, 2024]);
    expect(insts[0]!.programs).toBe(2); // both programs count in the latest year
  });
});
