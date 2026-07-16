// Data access for the Bookings table. Money-critical, so:
//  - slot double-booking is prevented by an ATOMIC TransactWrite (booking + a
//    slot-hold guarded by attribute_not_exists) — two students can't grab one slot.
//  - the ledger is APPEND-ONLY and each capture is keyed by the provider payment id
//    (attribute_not_exists guard) → a re-delivered webhook is a no-op (exactly-once).
//  - PENDING_PAYMENT holds carry a `ttl` so unpaid holds auto-release.
import {
  GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb, key, ConflictError } from '@sc/shared';
import { getEnv } from '@sc/config';
import type { BookingStatus } from '../types';

const TABLE = () => getEnv().TABLE_BOOKINGS;

export interface Booking {
  id: string;
  studentId: string;
  mentorId: string;
  mentorName?: string;
  slotId: string;
  startsAt: string;
  durationMin: number;
  priceINR: number;
  status: BookingStatus;
  videoRoomId?: string;
  meetingUrl?: string; // shared Google Meet link, set at payment confirmation
  meetingProvider?: string; // 'google' | 'stub'
  razorpayOrderId?: string; // the Razorpay order for this booking's payment
  razorpayPaymentId?: string; // the captured payment id (used for refunds)
  rating?: number;
  ratingComment?: string;
  createdAt: string;
  updatedAt: string;
}

const strip = (i: Record<string, unknown>): Booking => {
  const { PK, SK, gsi1pk, gsi1sk, gsi2pk, gsi2sk, ...rest } = i;
  return rest as unknown as Booking;
};

export const bookingsRepo = {
  async get(id: string): Promise<Booking | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.booking(id) }));
    return res.Item ? strip(res.Item) : null;
  },

  /** Look up a prior booking id for an idempotency key (replayed POST /bookings). */
  async getIdempotent(userId: string, k: string): Promise<string | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.idempotency(userId, k) }));
    return (res.Item?.bookingId as string | undefined) ?? null;
  },

  /**
   * Atomically create a booking, hold the slot, and (optionally) record the
   * idempotency key. Throws ConflictError('slot') if the slot is already held,
   * or returns { duplicate: existingBookingId } if the idempotency key raced.
   */
  async createWithHold(
    b: Booking,
    holdTtl: number,
    idempKey?: string,
  ): Promise<{ created: true } | { duplicate: string }> {
    const items: Record<string, unknown>[] = [
      {
        Put: {
          TableName: TABLE(),
          Item: {
            ...key.booking(b.id), ...b,
            gsi1pk: `USER#${b.studentId}`, gsi1sk: b.createdAt,
            gsi2pk: `MENTOR#${b.mentorId}`, gsi2sk: b.createdAt,
          },
        },
      },
      {
        Put: {
          TableName: TABLE(),
          Item: { ...key.slotHold(b.mentorId, b.slotId), bookingId: b.id, ttl: holdTtl },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ];
    if (idempKey) {
      items.push({
        Put: {
          TableName: TABLE(),
          Item: { ...key.idempotency(b.studentId, idempKey), bookingId: b.id, ttl: holdTtl },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }
    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: items as never }));
      return { created: true };
    } catch (err) {
      const e = err as { name?: string; CancellationReasons?: { Code?: string }[] };
      if (e.name === 'TransactionCanceledException') {
        const reasons = e.CancellationReasons ?? [];
        // items[1] = slot-hold, items[2] = idempotency
        if (reasons[1]?.Code === 'ConditionalCheckFailed') throw ConflictError('That slot is no longer available.');
        if (idempKey && reasons[2]?.Code === 'ConditionalCheckFailed') {
          const existing = await this.getIdempotent(b.studentId, idempKey);
          if (existing) return { duplicate: existing };
        }
      }
      throw err;
    }
  },

  /** Conditional status transition. `from` lists the allowed current states. */
  async transition(id: string, from: BookingStatus[], to: BookingStatus, extra: Record<string, unknown> = {}): Promise<Booking> {
    const names: Record<string, string> = { '#s': 'status', '#u': 'updatedAt' };
    const values: Record<string, unknown> = { ':to': to, ':now': new Date().toISOString() };
    const sets = ['#s = :to', '#u = :now'];
    let i = 0;
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) continue;
      names[`#e${i}`] = k; values[`:e${i}`] = v; sets.push(`#e${i} = :e${i}`); i++;
    }
    from.forEach((s, ix) => (values[`:f${ix}`] = s));
    const cond = 'attribute_exists(PK) AND #s IN (' + from.map((_, ix) => `:f${ix}`).join(', ') + ')';
    try {
      const res = await ddb.send(new UpdateCommand({
        TableName: TABLE(), Key: key.booking(id),
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: cond,
        ExpressionAttributeNames: names, ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }));
      return strip(res.Attributes as Record<string, unknown>);
    } catch (err) {
      // Condition failed → the booking is in a state this transition doesn't allow.
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        const cur = await this.get(id);
        throw ConflictError(cur ? `Cannot move a ${cur.status} session to ${to}.` : 'Booking not found.');
      }
      throw err;
    }
  },

  /** Append a ledger entry, exactly once per `eventId` (provider payment/refund id). */
  async appendLedger(bookingId: string, eventId: string, entry: Record<string, unknown>): Promise<boolean> {
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE(),
        Item: { PK: `LEDGER#${bookingId}`, SK: `EVT#${eventId}`, at: new Date().toISOString(), ...entry },
        ConditionExpression: 'attribute_not_exists(SK)',
      }));
      return true; // newly written
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return false; // already processed
      throw err;
    }
  },

  async ledger(bookingId: string): Promise<Record<string, unknown>[]> {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `LEDGER#${bookingId}` },
    }));
    return (res.Items ?? []).map(({ PK, SK, ...rest }) => rest);
  },

  async releaseHold(mentorId: string, slotId: string): Promise<void> {
    await ddb.send(new DeleteCommand({ TableName: TABLE(), Key: key.slotHold(mentorId, slotId) }));
  },

  /** Map a Razorpay order id → booking id (so a signed webhook can resolve the booking). */
  async putOrderMapping(orderId: string, bookingId: string, ttl: number): Promise<void> {
    await ddb.send(new PutCommand({ TableName: TABLE(), Item: { ...key.razorpayOrder(orderId), bookingId, ttl } }));
  },
  async getBookingIdByOrder(orderId: string): Promise<string | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: key.razorpayOrder(orderId) }));
    return (res.Item?.bookingId as string | undefined) ?? null;
  },

  async listByGsi(index: 'gsi1-student' | 'gsi2-mentor', pk: string): Promise<Booking[]> {
    const attr = index === 'gsi1-student' ? 'gsi1pk' : 'gsi2pk';
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE(), IndexName: index,
      KeyConditionExpression: `${attr} = :pk`,
      ExpressionAttributeValues: { ':pk': pk },
      ScanIndexForward: false, // newest first
    }));
    return (res.Items ?? []).map((i) => strip(i));
  },
};
