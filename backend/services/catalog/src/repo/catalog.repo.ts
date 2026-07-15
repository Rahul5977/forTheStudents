// Data access for the Catalog table + the in-memory snapshot cache.
// "compute-not-query": the active offerings are loaded ONCE per cold start and
// reused across warm invocations — the predictor never scans DynamoDB per request.
import { GetCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '@sc/shared';
import { getEnv } from '@sc/config';
import type { Offering } from '@sc/catalog-core';

const TABLE = () => getEnv().TABLE_CATALOG;

const catalogPk = (version: string) => `CATALOG#${version}`;
const CONFIG_PK = 'CONFIG';
const ACTIVE_SK = 'ACTIVE';

// Module-scope cache — persists across warm Lambda invocations.
let cache: { version: string; offerings: Offering[]; byId: Map<number, Offering> } | null = null;

async function getActiveVersion(): Promise<string | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: { PK: CONFIG_PK, SK: ACTIVE_SK } }));
  return (res.Item?.version as string | undefined) ?? null;
}

async function queryOfferings(version: string): Promise<Offering[]> {
  const out: Offering[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE(),
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': catalogPk(version) },
        ExclusiveStartKey,
      }),
    );
    for (const it of res.Items ?? []) out.push(it.offering as Offering);
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return out;
}

/** Load (and memoize) the active cutoff snapshot. */
export async function loadSnapshot(): Promise<{ version: string; offerings: Offering[] }> {
  if (cache) return cache;
  const version = await getActiveVersion();
  if (!version) throw new Error('No active catalog version published');
  const offerings = await queryOfferings(version);
  cache = { version, offerings, byId: new Map(offerings.map((o) => [o.id, o])) };
  return cache;
}

export async function getOffering(id: number): Promise<Offering | null> {
  const snap = await loadSnapshot();
  return cache?.byId.get(id) ?? snap.offerings.find((o) => o.id === id) ?? null;
}

/** Clear the in-memory cache (used by the seed script / a future publish hook). */
export function clearCache(): void {
  cache = null;
}

// ── Seeding (used by src/seed.ts, not the request path) ───────────────────────
export async function seed(version: string, offerings: Offering[]): Promise<void> {
  // Offerings in batches of 25 (BatchWrite limit).
  for (let i = 0; i < offerings.length; i += 25) {
    const chunk = offerings.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE()]: chunk.map((o) => ({
            PutRequest: { Item: { PK: catalogPk(version), SK: `OFFERING#${String(o.id).padStart(4, '0')}`, offering: o } },
          })),
        },
      }),
    );
  }
  // Flip the active-version pointer.
  await ddb.send(
    new BatchWriteCommand({
      RequestItems: { [TABLE()]: [{ PutRequest: { Item: { PK: CONFIG_PK, SK: ACTIVE_SK, version } } }] },
    }),
  );
  clearCache();
}
