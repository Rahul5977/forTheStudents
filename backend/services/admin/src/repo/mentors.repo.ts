// Moderation access to the Mentors table (owned by @sc/marketplace — see
// services/marketplace/src/repo/mentors.repo.ts for the full shape). We touch ONLY the
// MENTOR#<id>/PROFILE row and the sparse `gsi1-status` index (gsi1pk=`MENTOR#<STATUS>`,
// gsi1sk=`<statusChangedAt>#<userId>` — Phase 11 time-ordered shape):
//   - cheap status COUNTs for /admin/stats (never a table scan)
//   - GUARDED status flips for suspend / reinstate through the SHARED state machine
//     (APPROVED → SUSPENDED → APPROVED), written atomically with a ConditionExpression,
//     appending to the row's status history exactly like marketplace does.
import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key, ConflictError, NotFoundError, normalizeMentorStatus, type MentorStatus } from '@sc/shared';
import { getEnv } from '@sc/config';

const TABLE = () => getEnv().TABLE_MENTORS;

/** Mirrors the marketplace profile row (only the fields moderation cares about). STRICTLY typed status. */
export interface MentorRow {
  userId: string;
  name?: string;
  college?: string;
  branch?: string;
  status: MentorStatus;
  statusChangedAt?: string;
  history?: { from: MentorStatus | null; to: MentorStatus; by: string; at: string; note?: string }[];
  updatedAt?: string;
}

const strip = (item: Record<string, unknown>): MentorRow => {
  const { PK, SK, gsi1pk, gsi1sk, ...rest } = item;
  const row = rest as unknown as MentorRow;
  row.status = normalizeMentorStatus(row.status) ?? row.status;
  return row;
};

export const mentorsModRepo = {
  async get(userId: string): Promise<MentorRow | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.mentor(userId) }));
    return res.Item ? strip(res.Item) : null;
  },

  /** Cheap COUNT over the status GSI (Query + Select COUNT — never scans the table). */
  async countByStatus(status: MentorStatus): Promise<number> {
    let count = 0;
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(new QueryCommand({
        TableName: TABLE(),
        IndexName: 'gsi1-status',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': `MENTOR#${status}` },
        Select: 'COUNT',
        ExclusiveStartKey,
      }));
      count += res.Count ?? 0;
      ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (ExclusiveStartKey);
    return count;
  },

  /**
   * ATOMIC guarded flip `from` → `to` (the domain has already run assertTransition on the
   * shared machine; this is the DB-level twin). Re-keys the GSI + appends to `history`.
   */
  async transition(userId: string, from: MentorStatus, to: MentorStatus, by: string, note?: string): Promise<MentorRow> {
    const now = new Date().toISOString();
    try {
      const res = await ddb.send(new UpdateCommand({
        TableName: TABLE(),
        Key: key.mentor(userId),
        UpdateExpression: 'SET #s = :to, #u = :now, statusChangedAt = :sk, gsi1pk = :gpk, gsi1sk = :sk, #h = list_append(if_not_exists(#h, :empty), :entry)',
        ExpressionAttributeNames: { '#s': 'status', '#u': 'updatedAt', '#h': 'history' },
        ExpressionAttributeValues: {
          ':to': to, ':from': from, ':now': now, ':gpk': `MENTOR#${to}`, ':sk': `${now}#${userId}`,
          ':empty': [], ':entry': [{ from, to, by, at: now, ...(note ? { note } : {}) }],
        },
        ConditionExpression: 'attribute_exists(PK) AND #s = :from',
        ReturnValues: 'ALL_NEW',
      }));
      return strip(res.Attributes as Record<string, unknown>);
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        // Either no such mentor, or not currently `from` — disambiguate for a clean 404/409.
        const existing = await this.get(userId);
        if (!existing) throw NotFoundError('Mentor not found.');
        throw ConflictError(`Cannot move a ${existing.status} mentor to ${to}.`);
      }
      throw err;
    }
  },
};
