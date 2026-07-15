// Data access for the Planner table — two per-user singleton rows:
//   PK=USER#<id>  SK=SHORTLIST   { ids:number[], version, updatedAt }
//   PK=USER#<id>  SK=CHOICELIST  { ids:number[], version, updatedAt }
// Writes use OPTIMISTIC CONCURRENCY (a monotonic `version`) so two tabs / a
// double-tap can't silently clobber each other — a stale write gets a 409.
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key, ConflictError } from '@sc/shared';
import { getEnv } from '@sc/config';

const TABLE = () => getEnv().TABLE_PLANNER;

export interface ListRow {
  ids: number[];
  version: number;
  updatedAt?: string;
}

type ListKey = ReturnType<typeof key.shortlist> | ReturnType<typeof key.choiceList>;

async function getRow(k: ListKey): Promise<ListRow> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: k }));
  if (!res.Item) return { ids: [], version: 0 };
  return {
    ids: (res.Item.ids as number[] | undefined) ?? [],
    version: (res.Item.version as number | undefined) ?? 0,
    updatedAt: res.Item.updatedAt as string | undefined,
  };
}

/**
 * Replace a list's ids and atomically bump its version.
 * @param expectedVersion when provided, the write only succeeds if the stored
 *   version matches (or the row is new) — otherwise a 409 ConflictError.
 */
async function putRow(k: ListKey, ids: number[], expectedVersion?: number): Promise<ListRow> {
  const now = new Date().toISOString();
  const values: Record<string, unknown> = { ':ids': ids, ':now': now, ':one': 1 };
  let ConditionExpression: string | undefined;
  if (expectedVersion !== undefined) {
    ConditionExpression = 'attribute_not_exists(PK) OR #version = :expected';
    values[':expected'] = expectedVersion;
  }
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: k,
        UpdateExpression: 'SET #ids = :ids, #updatedAt = :now ADD #version :one',
        ExpressionAttributeNames: { '#ids': 'ids', '#updatedAt': 'updatedAt', '#version': 'version' },
        ExpressionAttributeValues: values,
        ConditionExpression,
        ReturnValues: 'ALL_NEW',
      }),
    );
    const attrs = res.Attributes ?? {};
    return { ids: (attrs.ids as number[]) ?? [], version: (attrs.version as number) ?? 1, updatedAt: now };
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw ConflictError('Your list changed elsewhere — reload and retry.');
    }
    throw err;
  }
}

export const plannerRepo = {
  getShortlist: (userId: string) => getRow(key.shortlist(userId)),
  getChoiceList: (userId: string) => getRow(key.choiceList(userId)),
  putShortlist: (userId: string, ids: number[], expectedVersion?: number) =>
    putRow(key.shortlist(userId), ids, expectedVersion),
  putChoiceList: (userId: string, ids: number[], expectedVersion?: number) =>
    putRow(key.choiceList(userId), ids, expectedVersion),
};
