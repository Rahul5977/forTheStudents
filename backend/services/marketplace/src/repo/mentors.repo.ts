// Data access for the Mentors table.
//   PK=MENTOR#<userId> SK=PROFILE      the mentor application/profile + verification state
//   PK=MENTOR#<userId> SK=AVAILABILITY slot list (optimistic concurrency)
//   PK=MENTOR#<userId> SK=EMAILOTP     ephemeral OTP (TTL)
//   PK=EMAILRL#<email|user:id> SK=RL   ephemeral OTP send counters (TTL)
// GSI1 `gsi1-status` (Phase 11: EVERY status is indexed):
//   gsi1pk = MENTOR#<STATUS>, gsi1sk = <statusChangedAt>#<userId>  → time-ordered queues with a
//   real cursor (oldest-first) for the admin console; MENTOR#APPROVED still powers GET /mentors.
//   (Pre-Phase-11 APPROVED rows carry `<college>#<userId>` — still in the index, just unordered.)
import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  ddb, key, ConflictError, NotFoundError, normalizeMentorStatus,
  type MentorStatus, type FieldVerifications,
} from '@sc/shared';
import { getEnv } from '@sc/config';
import type { DocType } from '../types';

const TABLE = () => getEnv().TABLE_MENTORS;
export const gsiPkFor = (status: MentorStatus) => `MENTOR#${status}`;
export const gsiSkFor = (changedAt: string, userId: string) => `${changedAt}#${userId}`;

export interface DocumentRef {
  key: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}
export interface StatusChange { from: MentorStatus | null; to: MentorStatus; by: string; at: string; note?: string }
export interface InterviewInfo {
  eventId: string;
  meetUrl: string;
  provider: 'google' | 'stub' | 'external';
  interviewAt: string;
  durationMin: number;
  scheduledBy: string;
  scheduledAt: string;
  note?: string;
}
export interface RejectionInfo { kind: 'soft' | 'hard'; reason: string; by: string; at: string }

export interface MentorProfile {
  userId: string;
  name: string;
  college: string;
  branch: string;
  year: number;
  gradYear?: number;
  rollNumber?: string;
  phone?: string;
  bio?: string;
  topics?: string[];
  priceINR: number;
  languages?: string[];
  jeeRank?: number;
  jeeYear?: number;
  essays?: { why?: string; how?: string; other?: string };
  consent?: { acceptedAt: string; version: string };
  documents?: Partial<Record<DocType, DocumentRef>>;
  status: MentorStatus;
  statusChangedAt?: string;
  submittedAt?: string;
  docsVerifiedAt?: string;
  history?: StatusChange[];
  /** per-field manual verification (Phase 11 packet 4) */
  fields?: FieldVerifications;
  emailVerified: boolean;
  /** kept for the deployed UI: true once the ID card document is on file */
  idVerified: boolean;
  /** the VERIFIED college (.ac.in) email — set by the OTP flow */
  email?: string;
  interview?: InterviewInfo;
  interviewAt?: string;   // legacy mirror of interview.interviewAt (deployed UI reads it)
  interviewLink?: string; // legacy mirror of interview.meetUrl
  rejection?: RejectionInfo;
  reviewNote?: string;    // legacy: last reviewer note (mentor-visible copy on soft reject)
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Slot { id: string; startsAt: string; durationMin: number; open: boolean }
export interface AvailabilityRow { slots: Slot[]; version: number; updatedAt?: string }

const strip = (item: Record<string, unknown>): MentorProfile => {
  const { PK, SK, gsi1pk, gsi1sk, ...rest } = item;
  const m = rest as unknown as MentorProfile;
  // Legacy `INTERVIEW` rows read as INTERVIEW_SCHEDULED (never orphaned; never written again).
  m.status = normalizeMentorStatus(m.status) ?? m.status;
  return m;
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
    if (v === null) removes.push(nk);
    else { values[`:v${i}`] = v; sets.push(`${nk} = :v${i}`); }
    i++;
  }
  return { sets, removes, names, values };
}
const joinExpr = (sets: string[], removes: string[]) =>
  [`SET ${sets.join(', ')}`, removes.length ? `REMOVE ${removes.join(', ')}` : ''].filter(Boolean).join(' ');

const encodeCursor = (k: Record<string, unknown> | undefined) => (k ? Buffer.from(JSON.stringify(k)).toString('base64url') : undefined);
const decodeCursor = (c: string | undefined): Record<string, unknown> | undefined => {
  if (!c) return undefined;
  try { return JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as Record<string, unknown>; }
  catch { throw ConflictError('Bad cursor.'); }
};

export const mentorsRepo = {
  async get(userId: string): Promise<MentorProfile | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.mentor(userId) }));
    return res.Item ? strip(res.Item) : null;
  },

  /** Create a fresh DRAFT profile (fails if one already exists). Indexed under MENTOR#DRAFT. */
  async create(profile: MentorProfile): Promise<void> {
    await ddb.send(new PutCommand({
      TableName: TABLE(),
      Item: { ...key.mentor(profile.userId), ...profile, gsi1pk: gsiPkFor(profile.status), gsi1sk: gsiSkFor(profile.createdAt, profile.userId) },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
  },

  /** Patch profile fields (null REMOVEs). Never changes `status` — use transition(). */
  async update(userId: string, patch: Record<string, unknown>, now: string): Promise<MentorProfile> {
    if ('status' in patch) throw new Error('use mentorsRepo.transition() to change status');
    const { sets, removes, names, values } = buildUpdate(patch, now);
    const res = await ddb.send(new UpdateCommand({
      TableName: TABLE(), Key: key.mentor(userId),
      UpdateExpression: joinExpr(sets, removes), ExpressionAttributeNames: names, ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)', ReturnValues: 'ALL_NEW',
    }));
    return strip(res.Attributes as Record<string, unknown>);
  },

  /**
   * ATOMIC status transition: the row must currently be in one of `from` (condition), then
   * status + GSI keys + statusChangedAt + history are written together with `patch`.
   * A lost race or an illegal edge surfaces as 409 — the domain has already run
   * assertTransition(), this is the DB-level twin of that guard.
   */
  async transition(
    userId: string, from: readonly MentorStatus[], to: MentorStatus,
    by: string, opts: { patch?: Record<string, unknown>; note?: string; now?: string } = {},
  ): Promise<MentorProfile> {
    const now = opts.now ?? new Date().toISOString();
    const { sets, removes, names, values } = buildUpdate(opts.patch ?? {}, now);
    names['#status'] = 'status'; names['#history'] = 'history';
    values[':to'] = to; values[':pk'] = gsiPkFor(to); values[':sk'] = gsiSkFor(now, userId);
    values[':empty'] = []; values[':h'] = [{ from: null, to, by, at: now, ...(opts.note ? { note: opts.note } : {}) } as StatusChange];
    const legacy = from.includes('INTERVIEW_SCHEDULED') ? ['INTERVIEW'] : [];
    const fromVals = [...from, ...legacy];
    fromVals.forEach((f, i) => { values[`:from${i}`] = f; });
    sets.push('#status = :to', 'statusChangedAt = :sk', 'gsi1pk = :pk', 'gsi1sk = :sk', '#history = list_append(if_not_exists(#history, :empty), :h)');
    try {
      const res = await ddb.send(new UpdateCommand({
        TableName: TABLE(), Key: key.mentor(userId),
        UpdateExpression: joinExpr(sets, removes), ExpressionAttributeNames: names, ExpressionAttributeValues: values,
        ConditionExpression: `attribute_exists(PK) AND #status IN (${fromVals.map((_, i) => `:from${i}`).join(', ')})`,
        ReturnValues: 'ALL_NEW',
      }));
      const out = strip(res.Attributes as Record<string, unknown>);
      out.statusChangedAt = now; // stored as the sk-shaped string; expose the plain ISO
      return out;
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        const cur = await this.get(userId);
        if (!cur) throw NotFoundError('Mentor not found.');
        throw ConflictError(`Cannot move a ${cur.status} application to ${to}.`);
      }
      throw err;
    }
  },

  // ── Email OTP (ephemeral, TTL) + send-rate counters ────────────────────────
  async putOtp(userId: string, email: string, code: string, ttl: number): Promise<void> {
    await ddb.send(new PutCommand({ TableName: TABLE(), Item: { ...key.mentorEmailOtp(userId), email, code, ttl, attempts: 0 } }));
  },
  async getOtp(userId: string): Promise<{ email: string; code: string; ttl: number; attempts: number } | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.mentorEmailOtp(userId) }));
    return res.Item ? { email: res.Item.email, code: res.Item.code, ttl: res.Item.ttl, attempts: res.Item.attempts ?? 0 } : null;
  },
  /** Count a failed attempt; returns the new total. */
  async bumpOtpAttempts(userId: string): Promise<number> {
    const res = await ddb.send(new UpdateCommand({
      TableName: TABLE(), Key: key.mentorEmailOtp(userId),
      UpdateExpression: 'ADD attempts :one', ExpressionAttributeValues: { ':one': 1 }, ReturnValues: 'ALL_NEW',
    }));
    return (res.Attributes?.attempts as number) ?? 1;
  },
  /** Sliding-window-ish send counter (one row per window, TTL'd). Returns the count AFTER this send. */
  async bumpSendCount(subject: string, windowSec: number): Promise<number> {
    const nowSec = Math.floor(Date.now() / 1000);
    const res = await ddb.send(new UpdateCommand({
      TableName: TABLE(), Key: key.mentorEmailRate(subject),
      UpdateExpression: 'ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl)',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':one': 1, ':ttl': nowSec + windowSec },
      ReturnValues: 'ALL_NEW',
    }));
    const a = res.Attributes ?? {};
    // Window expired but TTL sweep hasn't run yet → treat as a fresh window.
    if ((a.ttl as number) < nowSec) {
      await ddb.send(new PutCommand({ TableName: TABLE(), Item: { ...key.mentorEmailRate(subject), count: 1, ttl: nowSec + windowSec } }));
      return 1;
    }
    return (a.count as number) ?? 1;
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
      const res = await ddb.send(new UpdateCommand({
        TableName: TABLE(), Key: key.mentorAvailability(userId),
        UpdateExpression: 'SET #slots = :slots, #updatedAt = :now ADD #version :one',
        ExpressionAttributeNames: { '#slots': 'slots', '#updatedAt': 'updatedAt', '#version': 'version' },
        ExpressionAttributeValues: values, ConditionExpression, ReturnValues: 'ALL_NEW',
      }));
      const a = res.Attributes ?? {};
      return { slots: (a.slots as Slot[]) ?? [], version: (a.version as number) ?? 1, updatedAt: now };
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') throw ConflictError('Availability changed elsewhere — reload and retry.');
      throw err;
    }
  },

  // ── GSI1: one status partition, oldest-first, real cursor, optional text filter ──
  async queryByStatus(status: MentorStatus, opts: { limit: number; cursor?: string; q?: string; newestFirst?: boolean }): Promise<{ items: MentorProfile[]; nextCursor?: string }> {
    const items: MentorProfile[] = [];
    let ExclusiveStartKey = decodeCursor(opts.cursor);
    const q = opts.q?.trim().toLowerCase();
    // A filtered query can return sparse pages: keep paging (bounded) until the page fills.
    for (let hop = 0; hop < 10; hop++) {
      const res = await ddb.send(new QueryCommand({
        TableName: TABLE(), IndexName: 'gsi1-status',
        KeyConditionExpression: 'gsi1pk = :pk', ExpressionAttributeValues: { ':pk': gsiPkFor(status) },
        ScanIndexForward: !opts.newestFirst, Limit: opts.limit, ExclusiveStartKey,
      }));
      for (const it of res.Items ?? []) {
        const m = strip(it);
        if (q && !`${m.name} ${m.college} ${m.branch} ${m.email ?? ''} ${m.userId}`.toLowerCase().includes(q)) continue;
        items.push(m);
      }
      ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
      if (!ExclusiveStartKey || items.length >= opts.limit) break;
    }
    return { items: items.slice(0, opts.limit), nextCursor: encodeCursor(ExclusiveStartKey) };
  },

  /** Cheap COUNT over one status partition (Query + Select COUNT — never a table scan). */
  async countByStatus(status: MentorStatus): Promise<number> {
    let count = 0;
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(new QueryCommand({
        TableName: TABLE(), IndexName: 'gsi1-status',
        KeyConditionExpression: 'gsi1pk = :pk', ExpressionAttributeValues: { ':pk': gsiPkFor(status) },
        Select: 'COUNT', ExclusiveStartKey,
      }));
      count += res.Count ?? 0;
      ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (ExclusiveStartKey);
    return count;
  },

  /** The whole APPROVED set (public search index; a few thousand rows at most). */
  async listApproved(): Promise<MentorProfile[]> {
    const out: MentorProfile[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.queryByStatus('APPROVED', { limit: 100, cursor });
      out.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  },
};
