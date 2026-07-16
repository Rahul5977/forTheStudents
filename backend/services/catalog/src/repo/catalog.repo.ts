// Data access for the Catalog table + the in-memory snapshot cache.
// "compute-not-query": the active cutoffs are loaded ONCE per cold start and reused
// across warm invocations — the predictor never scans DynamoDB per request.
import { GetCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '@sc/shared';
import { getEnv } from '@sc/config';
import type { EnrichedCutoff } from '@sc/catalog-core';

const TABLE = () => getEnv().TABLE_CATALOG;
const cutoffPk = (version: string) => `CUTOFF#${version}`;
const CONFIG_PK = 'CONFIG';
const ACTIVE_SK = 'ACTIVE';

let cache: { version: string; cutoffs: EnrichedCutoff[] } | null = null;

async function getActiveVersion(): Promise<string | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: { PK: CONFIG_PK, SK: ACTIVE_SK } }));
  return (res.Item?.version as string | undefined) ?? null;
}

async function queryCutoffs(version: string): Promise<EnrichedCutoff[]> {
  const out: EnrichedCutoff[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE(),
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': cutoffPk(version) },
        ExclusiveStartKey,
      }),
    );
    for (const it of res.Items ?? []) out.push(it.cutoff as EnrichedCutoff);
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return out;
}

/** Load (and memoize) the active cutoff snapshot. */
export async function loadSnapshot(): Promise<{ version: string; cutoffs: EnrichedCutoff[] }> {
  if (cache) return cache;
  const version = await getActiveVersion();
  if (!version) throw new Error('No active catalog version published');
  const cutoffs = await queryCutoffs(version);
  cache = { version, cutoffs };
  return cache;
}

export function clearCache(): void { cache = null; }

// ── Seeding (used by src/seed.ts, off the request path) ───────────────────────
export async function seed(version: string, cutoffs: EnrichedCutoff[]): Promise<void> {
  for (let i = 0; i < cutoffs.length; i += 25) {
    const chunk = cutoffs.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE()]: chunk.map((c) => ({
            PutRequest: { Item: { PK: cutoffPk(version), SK: String(c.id).padStart(6, '0'), cutoff: c } },
          })),
        },
      }),
    );
  }
  await ddb.send(
    new BatchWriteCommand({ RequestItems: { [TABLE()]: [{ PutRequest: { Item: { PK: CONFIG_PK, SK: ACTIVE_SK, version } } }] } }),
  );
  clearCache();
}
