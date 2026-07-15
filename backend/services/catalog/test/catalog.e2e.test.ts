// Integration test: the WHOLE catalog app (routes → domain → repo → DynamoDB Local),
// seeded with a small real-shaped fixture. No AWS, no server.
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCutoffs } from '@sc/catalog-core';
import { app } from '../src/app';
import { seed } from '../src/repo/catalog.repo';
import { ensureCatalogTable } from '../src/dev/local-table';

const FIXTURE = [
  'Institute,Academic Program Name,Quota,Seat Type,Gender,Opening Rank,Closing Rank',
  '"Indian Institute of Technology Indore","Computer Science and Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,900,1567',
  '"National Institute of Technology, Warangal","Computer Science and Engineering (4 Years, Bachelor of Technology)",OS,OPEN,Gender-Neutral,1200,1876',
  '"National Institute of Technology, Warangal","Computer Science and Engineering (4 Years, Bachelor of Technology)",HS,OPEN,Gender-Neutral,400,900',
].join('\n');

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
});
