// Moderation access to the Mentors table (owned by @sc/marketplace — see
// services/marketplace/src/repo/mentors.repo.ts for the full shape). We touch ONLY the
// MENTOR#<id>/PROFILE row and the sparse `gsi1-status` index (gsi1pk=`MENTOR#<STATUS>`):
//   - cheap status COUNTs for /admin/stats (never a table scan)
//   - GUARDED status flips for suspend / reinstate (drop from / restore to public search)
import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key, ConflictError, NotFoundError } from '@sc/shared';
import { getEnv } from '@sc/config';

const TABLE = () => getEnv().TABLE_MENTORS;

/** Mirrors the marketplace profile row (only the fields moderation cares about). */
export interface MentorRow {
  userId: string;
  name?: string;
  college?: string;
  branch?: string;
  status: string;
  updatedAt?: string;
}

const strip = (item: Record<string, unknown>): MentorRow => {
  const { PK, SK, gsi1pk, gsi1sk, ...rest } = item;
  return rest as unknown as MentorRow;
};

export const mentorsModRepo = {
  async get(userId: string): Promise<MentorRow | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.mentor(userId) }));
    return res.Item ? strip(res.Item) : null;
  },

  /** Cheap COUNT over the status GSI (Query + Select COUNT — never scans the table). */
  async countByStatus(status: string): Promise<number> {
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
   * Suspend: status=SUSPENDED + REMOVE gsi1pk/gsi1sk → the mentor drops out of the public
   * search index immediately. GUARDED: only an APPROVED mentor can be suspended (condition).
   */
  async suspend(userId: string, now: string): Promise<MentorRow> {
    try {
      const res = await ddb.send(new UpdateCommand({
        TableName: TABLE(),
        Key: key.mentor(userId),
        UpdateExpression: 'SET #s = :suspended, #u = :now REMOVE gsi1pk, gsi1sk',
        ExpressionAttributeNames: { '#s': 'status', '#u': 'updatedAt' },
        ExpressionAttributeValues: { ':suspended': 'SUSPENDED', ':now': now, ':approved': 'APPROVED' },
        ConditionExpression: 'attribute_exists(PK) AND #s = :approved',
        ReturnValues: 'ALL_NEW',
      }));
      return strip(res.Attributes as Record<string, unknown>);
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        // Either no such mentor, or not currently APPROVED — disambiguate for a clean 404/409.
        const existing = await this.get(userId);
        if (!existing) throw NotFoundError('Mentor not found.');
        throw ConflictError(`Cannot suspend a ${existing.status} mentor — only APPROVED ones.`);
      }
      throw err;
    }
  },

  /**
   * Reinstate: status=APPROVED + restore gsi1pk='MENTOR#APPROVED', gsi1sk=`<college>#<id>`
   * (same shape marketplace writes on approval) → back in public search. GUARDED to SUSPENDED.
   */
  async reinstate(userId: string, college: string, now: string): Promise<MentorRow> {
    try {
      const res = await ddb.send(new UpdateCommand({
        TableName: TABLE(),
        Key: key.mentor(userId),
        UpdateExpression: 'SET #s = :approved, #u = :now, gsi1pk = :gpk, gsi1sk = :gsk',
        ExpressionAttributeNames: { '#s': 'status', '#u': 'updatedAt' },
        ExpressionAttributeValues: {
          ':approved': 'APPROVED', ':now': now,
          ':gpk': 'MENTOR#APPROVED', ':gsk': `${college}#${userId}`, ':suspended': 'SUSPENDED',
        },
        ConditionExpression: 'attribute_exists(PK) AND #s = :suspended',
        ReturnValues: 'ALL_NEW',
      }));
      return strip(res.Attributes as Record<string, unknown>);
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        const existing = await this.get(userId);
        if (!existing) throw NotFoundError('Mentor not found.');
        throw ConflictError(`Cannot reinstate a ${existing.status} mentor — only SUSPENDED ones.`);
      }
      throw err;
    }
  },
};
