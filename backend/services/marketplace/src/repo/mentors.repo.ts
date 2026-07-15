// Data access for the Mentors table.
//   PK=MENTOR#<userId> SK=PROFILE      the mentor profile + verification state
//   PK=MENTOR#<userId> SK=AVAILABILITY slot list (optimistic concurrency)
//   PK=MENTOR#<userId> SK=EMAILOTP     ephemeral OTP (TTL)
// GSI1 (sparse): gsi1pk='MENTOR#APPROVED' set only when APPROVED → powers GET /mentors.
import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, key, ConflictError } from '@sc/shared';
import { getEnv } from '@sc/config';
import type { MentorStatus } from '../types';

const TABLE = () => getEnv().TABLE_MENTORS;
// One sparse GSI serves two queues: gsi1pk = `MENTOR#<STATUS>` (set only for the
// listable statuses). Approved → public search; Pending → the admin review queue.
export const gsiPkFor = (status: MentorStatus) => `MENTOR#${status}`;

export interface MentorProfile {
  userId: string;
  name: string;
  college: string;
  branch: string;
  year: number;
  bio?: string;
  topics?: string[];
  priceINR: number;
  status: MentorStatus;
  emailVerified: boolean;
  idVerified: boolean;
  email?: string;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Slot { id: string; startsAt: string; durationMin: number; open: boolean }
export interface AvailabilityRow { slots: Slot[]; version: number; updatedAt?: string }

const strip = (item: Record<string, unknown>): MentorProfile => {
  const { PK, SK, gsi1pk, gsi1sk, ...rest } = item;
  return rest as unknown as MentorProfile;
};

/** Build a SET/REMOVE UpdateExpression; a `null` value REMOVEs the attribute. */
function buildUpdate(patch: Record<string, unknown>, now: string) {
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const values: Record<string, unknown> = { ':updatedAt': now };
  const sets = ['#updatedAt = :updatedAt'];
  const removes: string[] = [];
  let i = 0;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const nk = `#f${i}`;
    names[nk] = k;
    if (v === null) {
      removes.push(nk);
    } else {
      values[`:v${i}`] = v;
      sets.push(`${nk} = :v${i}`);
    }
    i++;
  }
  const expr = [`SET ${sets.join(', ')}`, removes.length ? `REMOVE ${removes.join(', ')}` : ''].filter(Boolean).join(' ');
  return { UpdateExpression: expr, ExpressionAttributeNames: names, ExpressionAttributeValues: values };
}

export const mentorsRepo = {
  async get(userId: string): Promise<MentorProfile | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.mentor(userId) }));
    return res.Item ? strip(res.Item) : null;
  },

  /** Create a fresh DRAFT profile (fails if one already exists). */
  async create(profile: MentorProfile): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: { ...key.mentor(profile.userId), ...profile },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  },

  /** Patch profile fields (null REMOVEs, e.g. clearing gsi1 keys on reject). */
  async update(userId: string, patch: Record<string, unknown>, now: string): Promise<MentorProfile> {
    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } = buildUpdate(patch, now);
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: key.mentor(userId),
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );
    return strip(res.Attributes as Record<string, unknown>);
  },

  // ── Email OTP (ephemeral, TTL) ──────────────────────────────────────────────
  async putOtp(userId: string, email: string, code: string, ttl: number): Promise<void> {
    await ddb.send(new PutCommand({ TableName: TABLE(), Item: { ...key.mentorEmailOtp(userId), email, code, ttl } }));
  },
  async getOtp(userId: string): Promise<{ email: string; code: string; ttl: number } | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.mentorEmailOtp(userId) }));
    return res.Item ? { email: res.Item.email, code: res.Item.code, ttl: res.Item.ttl } : null;
  },

  // ── Availability (optimistic concurrency) ───────────────────────────────────
  async getAvailability(userId: string): Promise<AvailabilityRow> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.mentorAvailability(userId) }));
    if (!res.Item) return { slots: [], version: 0 };
    return { slots: (res.Item.slots as Slot[]) ?? [], version: (res.Item.version as number) ?? 0, updatedAt: res.Item.updatedAt };
  },
  async putAvailability(userId: string, slots: Slot[], expectedVersion?: number): Promise<AvailabilityRow> {
    const now = new Date().toISOString();
    const values: Record<string, unknown> = { ':slots': slots, ':now': now, ':one': 1 };
    let ConditionExpression: string | undefined;
    if (expectedVersion !== undefined) {
      ConditionExpression = 'attribute_not_exists(PK) OR #version = :expected';
      values[':expected'] = expectedVersion;
    }
    try {
      const res = await ddb.send(
        new UpdateCommand({
          TableName: TABLE(),
          Key: key.mentorAvailability(userId),
          UpdateExpression: 'SET #slots = :slots, #updatedAt = :now ADD #version :one',
          ExpressionAttributeNames: { '#slots': 'slots', '#updatedAt': 'updatedAt', '#version': 'version' },
          ExpressionAttributeValues: values,
          ConditionExpression,
          ReturnValues: 'ALL_NEW',
        }),
      );
      const a = res.Attributes ?? {};
      return { slots: (a.slots as Slot[]) ?? [], version: (a.version as number) ?? 1, updatedAt: now };
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        throw ConflictError('Availability changed elsewhere — reload and retry.');
      }
      throw err;
    }
  },

  // ── GSI1 queues: approved (public search) or pending (admin queue) ──────────
  async listByGsi(gsi1pk: string): Promise<MentorProfile[]> {
    const out: MentorProfile[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE(),
          IndexName: 'gsi1-status',
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: { ':pk': gsi1pk },
          ExclusiveStartKey,
        }),
      );
      for (const it of res.Items ?? []) out.push(strip(it));
      ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (ExclusiveStartKey);
    return out;
  },
};
