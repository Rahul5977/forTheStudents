// Data access for the Users table. Keep all DynamoDB item-shaping HERE; the
// domain layer deals in UserProfile (transport shape), never raw items.
import { GetCommand, PutCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key } from '@sc/shared';
import { getEnv } from '@sc/config';
import type { RankPrefs, Role, UserProfile } from '@sc/shared';

const TABLE = () => getEnv().TABLE_USERS;

/** Storage shape of a user item (what lives in DynamoDB). */
interface UserItem {
  PK: string;
  SK: 'PROFILE';
  userId: string;
  role: Role;
  name?: string;
  email?: string;
  phone?: string;
  rankPrefs?: RankPrefs;
  permissions?: string[]; // admin permission scopes (role === 'admin')
  onboardedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string; // bumped on each /auth/bootstrap — drives the admin "live/active" view
}

/** Projected admin view of a user row (no rankPrefs — the admin list is a directory). */
export interface AdminUserRow {
  userId: string;
  role: Role;
  name?: string;
  email?: string;
  phone?: string;
  permissions?: string[];
  createdAt: string;
  lastSeenAt?: string;
}

function toProfile(item: UserItem): UserProfile {
  const { PK: _pk, SK: _sk, ...rest } = item;
  return rest;
}

/** Fields the profile PATCH is allowed to touch. Add here to widen it. */
type EditableField = 'name';

/**
 * Build a DynamoDB `SET` UpdateExpression from a patch object, skipping undefined
 * values and always bumping `updatedAt`. Names are aliased (#f0, #f1…) so reserved
 * words (e.g. `name`, `role`) are safe.
 */
function buildSet(patch: Record<string, unknown>, now: string) {
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const values: Record<string, unknown> = { ':updatedAt': now };
  const sets = ['#updatedAt = :updatedAt'];
  let i = 0;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const nk = `#f${i}`;
    const vk = `:v${i}`;
    names[nk] = k;
    values[vk] = v;
    sets.push(`${nk} = ${vk}`);
    i++;
  }
  return { UpdateExpression: `SET ${sets.join(', ')}`, ExpressionAttributeNames: names, ExpressionAttributeValues: values };
}

export const usersRepo = {
  /**
   * Fetch a user profile by id.
   * @returns UserProfile or null if not found.
   */
  async get(userId: string): Promise<UserProfile | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.user(userId) }));
    return res.Item ? toProfile(res.Item as UserItem) : null;
  },

  /**
   * Create the profile on first login (idempotent — won't overwrite an existing one).
   * @param input identity attributes lifted from the verified JWT.
   * @returns the created (or already-existing) profile.
   */
  async createIfAbsent(input: {
    userId: string;
    role: Role;
    email?: string;
    phone?: string;
    name?: string;
    now: string;
  }): Promise<void> {
    const item: UserItem = {
      ...key.user(input.userId),
      userId: input.userId,
      role: input.role,
      email: input.email,
      phone: input.phone,
      name: input.name,
      createdAt: input.now,
      updatedAt: input.now,
    };
    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)', // don't clobber returning users
      }),
    ).catch((err: unknown) => {
      // ConditionalCheckFailed => already exists => fine (idempotent bootstrap).
      if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    });
  },

  /** Patch mutable profile fields (only the whitelisted `EditableField`s). */
  async updateProfile(userId: string, patch: Partial<Record<EditableField, unknown>>, now: string): Promise<UserProfile> {
    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } = buildSet(patch, now);
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: key.user(userId),
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)', // user must have bootstrapped
        ReturnValues: 'ALL_NEW',
      }),
    );
    return toProfile(res.Attributes as UserItem);
  },

  /** Replace the rank & preferences block (the predictor inputs). */
  async setRankPrefs(userId: string, rankPrefs: RankPrefs, now: string): Promise<UserProfile> {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: key.user(userId),
        UpdateExpression: 'SET rankPrefs = :rp, updatedAt = :now',
        ExpressionAttributeValues: { ':rp': rankPrefs, ':now': now },
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );
    return toProfile(res.Attributes as UserItem);
  },

  /** Record a "seen now" timestamp (called on every bootstrap). Missing row ⇒ no-op. */
  async touchLastSeen(userId: string, now: string): Promise<void> {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: key.user(userId),
        UpdateExpression: 'SET lastSeenAt = :now',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: { ':now': now },
      }),
    ).catch((err: unknown) => {
      if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    });
  },

  /**
   * ADMIN-ONLY: scan up to `cap` user rows (paginated internally), projected to the admin
   * directory view. A full Scan is acceptable at the platform's *authenticated*-user volume
   * (the predictor is public/unauthed, so only signed-in users are stored here) and runs
   * infrequently from the admin console. // TODO(owner): at much larger scale, move counts to
   * a DynamoDB-Streams-fed Stats rollup (mirrors the Phase-7 mentor counters) to avoid scans.
   */
  async scanUsers(cap: number): Promise<{ rows: AdminUserRow[]; capped: boolean }> {
    const rows: AdminUserRow[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    let capped = false;
    do {
      const res = await ddb.send(
        new ScanCommand({
          TableName: TABLE(),
          ProjectionExpression: 'userId, #r, #n, email, phone, createdAt, lastSeenAt, #perms',
          ExpressionAttributeNames: { '#r': 'role', '#n': 'name', '#perms': 'permissions' },
          ExclusiveStartKey,
          Limit: 500,
        }),
      );
      for (const it of (res.Items ?? []) as AdminUserRow[]) {
        rows.push(it);
        if (rows.length >= cap) { capped = true; break; }
      }
      ExclusiveStartKey = capped ? undefined : (res.LastEvaluatedKey as Record<string, unknown> | undefined);
    } while (ExclusiveStartKey);
    return { rows, capped };
  },

  /** Change app role (student <-> mentor). */
  async setRole(userId: string, role: Role, now: string): Promise<UserProfile> {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: key.user(userId),
        UpdateExpression: 'SET #role = :role, updatedAt = :now',
        ExpressionAttributeNames: { '#role': 'role' },
        ExpressionAttributeValues: { ':role': role, ':now': now },
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );
    return toProfile(res.Attributes as UserItem);
  },

  /** Superadmin management: set a user's role AND admin permission scopes together. */
  async setRoleAndPermissions(userId: string, role: Role, permissions: string[], now: string): Promise<UserProfile> {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: key.user(userId),
        UpdateExpression: 'SET #role = :role, #perms = :perms, updatedAt = :now',
        ExpressionAttributeNames: { '#role': 'role', '#perms': 'permissions' },
        ExpressionAttributeValues: { ':role': role, ':perms': permissions, ':now': now },
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );
    return toProfile(res.Attributes as UserItem);
  },
};
