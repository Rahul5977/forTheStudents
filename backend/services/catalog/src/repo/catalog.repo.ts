// Data access for the Catalog table + the in-memory snapshot cache.
// "compute-not-query": the active cutoffs are loaded ONCE per cold start and reused
// across warm invocations — the predictor never scans DynamoDB per request.
//
// Resilience (warm containers outlive a reseed):
//   • Soft-TTL: past SOFT_TTL_MS we do ONE cheap GetCommand for the ACTIVE pointer and
//     only re-run the full ~11k-row query if the active version actually changed — so a
//     reseed propagates without a cold start, and unchanged warm requests never re-query.
//   • In-flight dedup: simultaneous cold loads (or a version-change reload) share ONE query
//     instead of every concurrent request scanning the table.
//   • A missing active-version pointer surfaces as a 503 (ServiceUnavailableError), not a
//     bare Error → ugly 500.
import { GetCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ServiceUnavailableError } from '@sc/shared';
import { getEnv } from '@sc/config';
import type { EnrichedCutoff } from '@sc/catalog-core';

const TABLE = () => getEnv().TABLE_CATALOG;
const cutoffPk = (version: string) => `CUTOFF#${version}`;
const CONFIG_PK = 'CONFIG';
const ACTIVE_SK = 'ACTIVE';

// How long a loaded snapshot is trusted before we re-check the ACTIVE pointer.
const SOFT_TTL_MS = 5 * 60 * 1000;

interface Snapshot { version: string; cutoffs: EnrichedCutoff[]; loadedAt: number }

let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null; // dedups concurrent full (re)loads
let refreshing: Promise<Snapshot> | null = null; // dedups the soft-TTL pointer re-check

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

/** Full (re)load for a given active version. Missing pointer → 503, not a bare 500. */
async function buildSnapshot(): Promise<Snapshot> {
  const version = await getActiveVersion();
  if (!version) throw ServiceUnavailableError('No active catalog version published');
  const cutoffs = await queryCutoffs(version);
  return { version, cutoffs, loadedAt: Date.now() };
}

/** Cold load (no cache yet); concurrent callers share the one in-flight query. */
function coldLoad(): Promise<Snapshot> {
  if (inflight) return inflight;
  inflight = buildSnapshot()
    .then((snap) => { cache = snap; return snap; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Past the soft-TTL: one cheap pointer GET; reload the snapshot only if the version
 *  changed, else just extend the current snapshot's freshness. Best-effort — a transient
 *  control-plane blip must NOT 503 a warm container that already holds valid data. */
function softRefresh(current: Snapshot): Promise<Snapshot> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const version = await getActiveVersion();
      if (version && version !== current.version) {
        // A reseed published a new active version — reload the full snapshot (deduped).
        return coldLoad();
      }
    } catch {
      // Pointer read failed transiently — keep serving the current (valid) snapshot.
    }
    current.loadedAt = Date.now(); // unchanged: extend freshness, skip the full query
    return current;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

/** Load (and memoize) the active cutoff snapshot, re-checking the active version on a
 *  soft-TTL so a reseed reaches warm containers without waiting for a cold start. */
export async function loadSnapshot(): Promise<Snapshot> {
  if (!cache) return coldLoad();
  if (Date.now() - cache.loadedAt < SOFT_TTL_MS) return cache;
  return softRefresh(cache);
}

export function clearCache(): void { cache = null; inflight = null; refreshing = null; }

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
