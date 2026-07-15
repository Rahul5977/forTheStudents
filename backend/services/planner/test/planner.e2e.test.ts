// Integration test: the whole planner app (routes -> domain -> repo -> DynamoDB
// Local), seeded with a tiny catalog so List Doctor can bucket choices.
import { beforeAll, describe, expect, it } from 'vitest';
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { parseCutoffs } from '@sc/catalog-core';
import { ddb } from '@sc/shared';
import { app } from '../src/app';
import { ensurePlannerTable } from '../src/dev/local-table';
import { ensureCatalogTable } from '../../catalog/src/dev/local-table';
import { clearCache } from '../src/repo/catalog.reader';

const CATALOG = process.env.TABLE_CATALOG!;
const PLANNER = process.env.TABLE_PLANNER!;

// adv 850 → id1 safe(1567), id2 target(800), id3 reach(500).
const FIXTURE = [
  'Institute,Academic Program Name,Quota,Seat Type,Gender,Opening Rank,Closing Rank',
  '"Indian Institute of Technology Bombay","Computer Science and Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,1,1567',
  '"Indian Institute of Technology Delhi","Computer Science and Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,1,800',
  '"Indian Institute of Technology Madras","Computer Science and Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,1,500',
].join('\n');

/** Fake the verified-JWT bindings for a given user. */
const authAs = (sub: string) =>
  ({ event: { requestContext: { authorizer: { jwt: { claims: { sub, 'custom:role': 'student' } } } } } }) as unknown as Parameters<typeof app.request>[2];

async function seedCatalog() {
  const cutoffs = parseCutoffs(FIXTURE);
  for (const c of cutoffs) {
    await ddb.send(new PutCommand({ TableName: CATALOG, Item: { PK: 'CUTOFF#test-v1', SK: String(c.id).padStart(6, '0'), cutoff: c } }));
  }
  await ddb.send(new PutCommand({ TableName: CATALOG, Item: { PK: 'CONFIG', SK: 'ACTIVE', version: 'test-v1' } }));
  clearCache();
}

beforeAll(async () => {
  await ensurePlannerTable();
  await ensureCatalogTable();
  await seedCatalog();
  // Deterministic clean start for the test users.
  for (const sub of ['u_a', 'u_b']) {
    for (const sk of ['SHORTLIST', 'CHOICELIST']) {
      await ddb.send(new DeleteCommand({ TableName: PLANNER, Key: { PK: `USER#${sub}`, SK: sk } }));
    }
  }
});

const A = authAs('u_a');
const B = authAs('u_b');

describe('planner service (local DynamoDB)', () => {
  it('shortlist round-trips and versions', async () => {
    const put = await (await app.request('/shortlist', { method: 'PUT', body: JSON.stringify({ collegeIds: [1, 3] }) }, A)).json();
    expect(put.collegeIds).toEqual([1, 3]);
    expect(put.version).toBe(1);
    const get = await (await app.request('/shortlist', {}, A)).json();
    expect(get.collegeIds).toEqual([1, 3]);
    expect(get.version).toBe(1);
  });

  it('choice-list round-trips (ordered) and reorder moves a row', async () => {
    let cl = await (await app.request('/choice-list', { method: 'PUT', body: JSON.stringify({ items: [3, 2, 1] }) }, A)).json();
    expect(cl.items).toEqual([3, 2, 1]);
    // move index 0 (id 3) to index 2 -> [2,1,3]
    cl = await (await app.request('/choice-list/reorder', { method: 'POST', body: JSON.stringify({ from: 0, to: 2 }) }, A)).json();
    expect(cl.items).toEqual([2, 1, 3]);
    const get = await (await app.request('/choice-list', {}, A)).json();
    expect(get.items).toEqual([2, 1, 3]);
  });

  it('optimistic concurrency: a stale version write is 409', async () => {
    await app.request('/choice-list', { method: 'PUT', body: JSON.stringify({ items: [1] }) }, B); // version -> 1
    const stale = await app.request('/choice-list', { method: 'PUT', body: JSON.stringify({ items: [2], version: 0 }) }, B);
    expect(stale.status).toBe(409);
  });

  it('List Doctor buckets the saved list + flags too-few / no-safe', async () => {
    // A currently has [2,1,3] = target, safe, reach.
    const r = await (await app.request('/choice-list/doctor?advRank=850&category=Open&home=Delhi', {}, A)).json();
    expect(r.items.map((i: { bucket: string }) => i.bucket)).toEqual(['target', 'safe', 'reach']);
    expect(r.summary).toEqual({ total: 3, safe: 1, target: 1, reach: 1 });
    const titles = r.warnings.map((w: { title: string }) => w.title);
    expect(titles).toContain('Too few choices'); // 3 < 6
    expect(titles).not.toContain('No Safe colleges'); // has a safe
  });

  it('doctor flags "No Safe colleges" when none are safe', async () => {
    await app.request('/choice-list', { method: 'PUT', body: JSON.stringify({ items: [2, 3] }) }, A); // target, reach
    const r = await (await app.request('/choice-list/doctor?advRank=850&category=Open&home=Delhi', {}, A)).json();
    expect(r.summary.safe).toBe(0);
    expect(r.warnings.map((w: { title: string }) => w.title)).toContain('No Safe colleges');
  });

  it('lists are per-user isolated', async () => {
    const a = await (await app.request('/shortlist', {}, A)).json();
    const b = await (await app.request('/shortlist', {}, B)).json();
    expect(a.collegeIds).toEqual([1, 3]);
    expect(b.collegeIds).toEqual([]); // B never set a shortlist
  });

  it('export is a stubbed 501 (owner writes PDF render)', async () => {
    const res = await app.request('/choice-list/export', { method: 'POST' }, A);
    expect(res.status).toBe(501);
    expect((await res.json()).status).toBe('not_implemented');
  });
});
