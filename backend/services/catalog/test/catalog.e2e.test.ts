// Integration test: the WHOLE catalog app (routes → domain → repo → DynamoDB Local),
// seeded with a small real-shaped fixture. No AWS, no server.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '@sc/shared';
import { getEnv } from '@sc/config';
import { parseCutoffs } from '@sc/catalog-core';
import { app } from '../src/app';
import { seed, clearCache } from '../src/repo/catalog.repo';
import { ensureCatalogTable } from '../src/dev/local-table';

const FIXTURE = [
  'Institute,Academic Program Name,Quota,Seat Type,Gender,Opening Rank,Closing Rank',
  '"Indian Institute of Technology Indore","Computer Science and Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,900,1567',
  '"National Institute of Technology, Warangal","Computer Science and Engineering (4 Years, Bachelor of Technology)",OS,OPEN,Gender-Neutral,1200,1876',
  '"National Institute of Technology, Warangal","Computer Science and Engineering (4 Years, Bachelor of Technology)",HS,OPEN,Gender-Neutral,400,900',
].join('\n');

// A DISTINCT second version (3 institutes vs FIXTURE's 2) — proves a reseed actually
// re-queries, not just relabels: the reloaded snapshot has a different institute count.
const FIXTURE_V2 = [
  'Institute,Academic Program Name,Quota,Seat Type,Gender,Opening Rank,Closing Rank',
  '"Indian Institute of Technology Indore","Computer Science and Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,900,1567',
  '"National Institute of Technology, Warangal","Computer Science and Engineering (4 Years, Bachelor of Technology)",OS,OPEN,Gender-Neutral,1200,1876',
  '"Indian Institute of Technology Bombay","Computer Science and Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,60,120',
].join('\n');

// Direct writes to the CONFIG/ACTIVE pointer — simulate an EXTERNAL reseed that flips the
// active version without clearing THIS process's warm cache (as a separate container would).
const activeKey = () => ({ TableName: getEnv().TABLE_CATALOG, Key: { PK: 'CONFIG', SK: 'ACTIVE' } });
const setActiveVersion = (version: string) =>
  ddb.send(new PutCommand({ TableName: getEnv().TABLE_CATALOG, Item: { PK: 'CONFIG', SK: 'ACTIVE', version } }));
const deleteActiveVersion = () => ddb.send(new DeleteCommand(activeKey()));

// Empty Lambda bindings — catalog routes are public and never call getPrincipal.
const env = { event: { requestContext: {} } } as unknown as Parameters<typeof app.request>[2];

beforeAll(async () => {
  await ensureCatalogTable();
  await seed('test-v1', parseCutoffs(FIXTURE));
});

describe('catalog service (local DynamoDB)', () => {
  it('GET /predict buckets real cutoffs + returns enrichment', async () => {
    const res = await app.request('/predict?advRank=850&mainRank=4200&category=Open&home=Delhi', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe('test-v1');
    const indore = body.results.find((r: { college: string }) => r.college === 'IIT Indore');
    expect(indore.bucket).toBe('safe'); // 850/1567
    expect(indore.city).toBe('Indore');
    expect(indore.nirf).toBe(16);
  });

  it('applies Home-State quota via the API', async () => {
    // rank 1400 keeps BOTH OS (1400/1876=0.75) and HS (1400/900=1.56) under the ≤1.6 trim.
    const away = await (await app.request('/predict?mainRank=1400&category=Open&home=Delhi', {}, env)).json();
    const home = await (await app.request('/predict?mainRank=1400&category=Open&home=Telangana', {}, env)).json();
    const nitwAway = away.results.find((r: { college: string }) => r.college === 'NIT Warangal');
    const nitwHome = home.results.find((r: { college: string }) => r.college === 'NIT Warangal');
    expect(nitwAway.close).toBe(1876); // OS
    expect(nitwHome.close).toBe(900); // HS (home)
    expect(nitwHome.homeQuota).toBe(true);
  });

  it('GET /colleges lists distinct institutes', async () => {
    const body = await (await app.request('/colleges', {}, env)).json();
    expect(body.count).toBe(2);
  });

  it('GET /colleges/:id returns analysis for one offering', async () => {
    const body = await (await app.request('/colleges/1?advRank=850', {}, env)).json();
    expect(body.college.close).toBeGreaterThan(0);
    expect(body.chart.years).toEqual(['2024']);
  });

  it('GET /colleges/:id 404s for a missing id', async () => {
    const res = await app.request('/colleges/99999', {}, env);
    expect(res.status).toBe(404);
  });

  it('400s on present-but-invalid /predict input, but a bare /predict stays valid', async () => {
    // Present-but-invalid must FAIL FAST so a coerced-nonsense 200 never gets CDN-cached.
    // (Exercises the full chain: catalog-core's AppError-shaped throw → @sc/shared middleware
    //  → structural toErrorBody mapping → 400.)
    const neg = await app.request('/predict?advRank=-5&category=Open', {}, env);
    expect(neg.status).toBe(400);
    expect((await neg.json()).error.code).toBe('VALIDATION');
    expect((await app.request('/predict?category=Platinum', {}, env)).status).toBe(400); // unknown enum
    expect((await app.request('/predict?mainRank=abc', {}, env)).status).toBe(400); // non-numeric
    expect((await app.request('/predict?advRank=3000001', {}, env)).status).toBe(400); // > MAX_RANK
    // Absent rank is the UI's valid "no rank yet" initial state — must still 200.
    expect((await app.request('/predict', {}, env)).status).toBe(200);
  });
});

describe('GET /colleges/compare (batch analysis)', () => {
  it('returns decorated { college, chart } entries for multiple ids', async () => {
    const res = await app.request('/colleges/compare?ids=1,2&advRank=850&mainRank=1400', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe('test-v1');
    expect(body.count).toBe(2);
    expect(body.results).toHaveLength(2);
    // Same shape the single-college view (and the Compare UI) already consumes.
    const first = body.results[0].college;
    expect(first.close).toBeGreaterThan(0);
    expect(first.seatType).toBeDefined();
    expect(first.quota).toBeDefined();
    expect(first.instituteId).toBeTruthy();
    expect(first.examLabel).toBeDefined();
    expect(typeof first.pct).toBe('number');
    expect(body.results[0].chart.years.length).toBeGreaterThan(0);
  });

  it('is matched BEFORE /colleges/:id (compare is not parsed as a row id)', async () => {
    // Wrong route ordering would send "compare" to the :id integer validator → 400.
    const res = await app.request('/colleges/compare?ids=1,2', {}, env);
    expect(res.status).toBe(200);
  });

  it('de-dupes repeated ids', async () => {
    const body = await (await app.request('/colleges/compare?ids=1,1,2', {}, env)).json();
    expect(body.count).toBe(2);
  });

  it('400s outside the 2..6 id range', async () => {
    expect((await app.request('/colleges/compare?ids=1', {}, env)).status).toBe(400);
    expect((await app.request('/colleges/compare', {}, env)).status).toBe(400);
    expect((await app.request('/colleges/compare?ids=1,2,3,4,5,6,7', {}, env)).status).toBe(400);
  });

  it('400s on a non-integer id', async () => {
    const res = await app.request('/colleges/compare?ids=1,abc', {}, env);
    expect(res.status).toBe(400);
  });

  it('404s when none of the ids resolve to a cutoff', async () => {
    const res = await app.request('/colleges/compare?ids=90001,90002', {}, env);
    expect(res.status).toBe(404);
  });
});

describe('catalog repo resilience', () => {
  it('re-checks the ACTIVE pointer past the soft-TTL and picks up a reseed', async () => {
    // Stage a distinct v2 in the table, then restore v1 as the active pointer so a cold
    // start sees v1 (the reseed hasn't "happened" for this container yet).
    await seed('test-v2', parseCutoffs(FIXTURE_V2));
    await setActiveVersion('test-v1');
    clearCache();

    // Warm the cache on v1.
    const warm = await (await app.request('/colleges', {}, env)).json();
    expect(warm.version).toBe('test-v1');
    expect(warm.count).toBe(2);

    // Another container reseeds → ACTIVE flips to v2 (v2 rows already present).
    await setActiveVersion('test-v2');

    // WITHIN the TTL the warm cache must NOT re-query — still serves v1.
    const stale = await (await app.request('/colleges', {}, env)).json();
    expect(stale.version).toBe('test-v1');
    expect(stale.count).toBe(2);

    // PAST the TTL: one cheap pointer GET sees v2 → full reload → new snapshot.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 6 * 60 * 1000);
      const refreshed = await (await app.request('/colleges', {}, env)).json();
      expect(refreshed.version).toBe('test-v2');
      expect(refreshed.count).toBe(3); // proves it re-queried (distinct institute count)
    } finally {
      vi.useRealTimers();
      await setActiveVersion('test-v1'); // restore for later tests
      clearCache();
    }
  });

  it('503s (SERVICE_UNAVAILABLE) when no active version is published', async () => {
    clearCache();
    await deleteActiveVersion();
    try {
      const res = await app.request('/predict?mainRank=1000', {}, env);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await setActiveVersion('test-v1'); // restore for later tests
      clearCache();
    }
  });

  it('dedups simultaneous cold loads into a single snapshot query', async () => {
    clearCache();
    const spy = vi.spyOn(ddb, 'send');
    try {
      // Two concurrent cold requests must SHARE one in-flight cutoff query, not run two.
      await Promise.all([app.request('/colleges', {}, env), app.request('/colleges', {}, env)]);
      const queryCalls = spy.mock.calls.filter(([cmd]) => cmd instanceof QueryCommand).length;
      expect(queryCalls).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
