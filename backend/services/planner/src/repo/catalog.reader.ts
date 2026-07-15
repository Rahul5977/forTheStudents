// READ-ONLY view of the Catalog table's active snapshot, so List Doctor can
// decorate each saved choice with its predictor bucket (reusing @sc/catalog-core).
// Mirrors services/catalog's loadSnapshot (same keys) but read-only + memoized.
// NOTE: intentional small duplication to keep services decoupled; if a third
// consumer appears, extract a shared `@sc/catalog-repo` package.
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '@sc/shared';
import { getEnv } from '@sc/config';
import type { Cutoff } from '@sc/catalog-core';

const TABLE = () => getEnv().TABLE_CATALOG;
const cutoffPk = (version: string) => `CUTOFF#${version}`;

let cache: { version: string; cutoffs: Cutoff[]; byId: Map<number, Cutoff> } | null = null;

async function queryCutoffs(version: string): Promise<Cutoff[]> {
  const out: Cutoff[] = [];
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
    for (const it of res.Items ?? []) out.push(it.cutoff as Cutoff);
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return out;
}

/** Load (and memoize) the active cutoff snapshot + an id→cutoff index. */
export async function loadSnapshot() {
  if (cache) return cache;
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: { PK: 'CONFIG', SK: 'ACTIVE' } }));
  const version = (res.Item?.version as string | undefined) ?? null;
  if (!version) throw new Error('No active catalog version published');
  const cutoffs = await queryCutoffs(version);
  cache = { version, cutoffs, byId: new Map(cutoffs.map((c) => [c.id, c])) };
  return cache;
}

export function clearCache(): void {
  cache = null;
}
