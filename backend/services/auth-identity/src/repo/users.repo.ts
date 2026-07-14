// Data access for the Users table. Keep all DynamoDB item-shaping HERE; the
// domain layer deals in UserProfile (transport shape), never raw items.
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
  createdAt: string;
  updatedAt: string;
}

function toProfile(item: UserItem): UserProfile {
  const { PK: _pk, SK: _sk, ...rest } = item;
  return rest;
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

  /** Patch mutable profile fields. */
  async updateProfile(userId: string, patch: Partial<Pick<UserProfile, 'name'>>, now: string): Promise<UserProfile> {
    // TODO(owner): build the UpdateExpression from `patch` keys generically, or
    // hand-write per field. Below is a minimal name-only example.
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: key.user(userId),
        UpdateExpression: 'SET #name = :name, updatedAt = :now',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: { ':name': patch.name, ':now': now },
        ConditionExpression: 'attribute_exists(PK)',
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
};
