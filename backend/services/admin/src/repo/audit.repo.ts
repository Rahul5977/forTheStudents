// Append-only admin audit trail (Audit table, architecture.md §6.2).
//   PK=ADMIN#<adminId>  SK=ACT#<ts>   ts = `${iso}#${ulid}` so same-ms actions don't collide.
// APPEND-ONLY: we ONLY ever Put — never update or delete an entry. Read newest-first per
// admin (Query, no scan). A cross-admin/by-entity view is a GSI (`GSI1: entity`) — deferred.
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key, newId } from '@sc/shared';
import { getEnv } from '@sc/config';

const TABLE = () => getEnv().TABLE_AUDIT;

export interface AuditEntry {
  adminId: string;
  action: string;
  /** the acted-on entity (e.g. a mentor userId), when applicable. */
  target?: string;
  /** small structured context — never secrets/PII beyond what's needed. */
  detail?: Record<string, unknown>;
  at: string;
}

export const auditRepo = {
  /** Append one immutable action row. Returns what was written. */
  async append(adminId: string, action: string, e: { target?: string; detail?: Record<string, unknown> } = {}): Promise<AuditEntry> {
    const at = new Date().toISOString();
    const entry: AuditEntry = { adminId, action, target: e.target, detail: e.detail, at };
    await ddb.send(new PutCommand({ TableName: TABLE(), Item: { ...key.audit(adminId, `${at}#${newId()}`), ...entry } }));
    return entry;
  },

  /** Recent entries for one admin, newest-first (SK is time-sortable → ScanIndexForward false). */
  async recent(adminId: string, limit = 50): Promise<AuditEntry[]> {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `ADMIN#${adminId}`, ':sk': 'ACT#' },
      ScanIndexForward: false,
      Limit: limit,
    }));
    return (res.Items ?? []).map(({ PK, SK, ...rest }) => rest as AuditEntry);
  },

  /** Cheap COUNT of one admin's own actions (Query + Select COUNT — never a table scan). */
  async count(adminId: string): Promise<number> {
    let count = 0;
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(new QueryCommand({
        TableName: TABLE(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `ADMIN#${adminId}`, ':sk': 'ACT#' },
        Select: 'COUNT',
        ExclusiveStartKey,
      }));
      count += res.Count ?? 0;
      ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (ExclusiveStartKey);
    return count;
  },
};
