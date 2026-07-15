// Phase 8 unit tests — PURE, no DynamoDB/S3.
//   - toLine() shapes a stream record into the NDJSON line we persist (and drops PII).
//   - reconcile() folds gross/fee/net/refunds and flags settlement mismatches.
import { describe, expect, it } from 'vitest';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBRecord } from 'aws-lambda';
import { toLine, tableFromArn } from '../src/stream';
import { reconcile, type LedgerEntry, type SettlementRow } from '../src/reconcile';

// A realistic Bookings stream record (booking confirmed). NewImage carries both wanted
// facts (status, priceINR, mentorId) and a PII field (studentEmail) that must be dropped.
function bookingRecord(): DynamoDBRecord {
  return {
    eventName: 'MODIFY',
    eventSourceARN: 'arn:aws:dynamodb:ap-south-1:123456789012:table/sc-dev-bookings/stream/2026-07-15T00:00:00.000',
    dynamodb: {
      ApproximateCreationDateTime: Date.parse('2026-07-15T09:30:00.000Z') / 1000,
      Keys: marshall({ PK: 'BOOKING#bk_1', SK: 'META' }),
      NewImage: marshall({
        PK: 'BOOKING#bk_1', SK: 'META', status: 'CONFIRMED', priceINR: 1500,
        mentorId: 'MENTOR#m1', studentId: 'stu1', studentEmail: 'secret@example.com', ratingComment: 'nice',
      }),
    },
  } as unknown as DynamoDBRecord;
}

describe('toLine (pure)', () => {
  it('shapes a stream record and keeps only allow-listed fields', () => {
    const line = toLine(bookingRecord());
    expect(line.table).toBe('sc-dev-bookings');
    expect(line.eventName).toBe('MODIFY');
    expect(line.keys).toEqual({ PK: 'BOOKING#bk_1', SK: 'META' });
    expect(line.newImage).toEqual({ status: 'CONFIRMED', priceINR: 1500, mentorId: 'MENTOR#m1', studentId: 'stu1' });
    // PII / free-text must NOT reach the lake.
    expect(line.newImage.studentEmail).toBeUndefined();
    expect(line.newImage.ratingComment).toBeUndefined();
    // ts comes from ApproximateCreationDateTime and drives the dt= partition.
    expect(line.ts).toBe('2026-07-15T09:30:00.000Z');
    expect(line.ts.slice(0, 10)).toBe('2026-07-15');
  });

  it('tableFromArn extracts the table name; falls back to "unknown"', () => {
    expect(tableFromArn('arn:aws:dynamodb:ap-south-1:1:table/sc-dev-mentors/stream/x')).toBe('sc-dev-mentors');
    expect(tableFromArn(undefined)).toBe('unknown');
  });

  it('handles a REMOVE with no NewImage (empty image, keys only)', () => {
    const rec = {
      eventName: 'REMOVE',
      eventSourceARN: 'arn:aws:dynamodb:ap-south-1:1:table/sc-dev-bookings/stream/x',
      dynamodb: { Keys: marshall({ PK: 'BOOKING#bk_9', SK: 'META' }) },
    } as unknown as DynamoDBRecord;
    const line = toLine(rec);
    expect(line.eventName).toBe('REMOVE');
    expect(line.newImage).toEqual({});
    expect(line.keys).toEqual({ PK: 'BOOKING#bk_9', SK: 'META' });
  });
});

describe('reconcile (pure)', () => {
  const ledger: LedgerEntry[] = [
    { type: 'order.created', amountINR: 1000 },
    { type: 'payment.captured', amountINR: 1000, providerPaymentId: 'pay_A' },
    { type: 'payment.captured', amountINR: 2000, providerPaymentId: 'pay_B' },
    { type: 'refund.issued', amountINR: 500, providerPaymentId: 'rfnd_A' },
  ];

  it('computes gross/fee/net/refunds', () => {
    const r = reconcile(ledger, [
      { providerPaymentId: 'pay_A', amountINR: 1000 },
      { providerPaymentId: 'pay_B', amountINR: 2000 },
    ]);
    expect(r.grossINR).toBe(3000);
    expect(r.feeINR).toBe(600); // 20%
    expect(r.netINR).toBe(2400); // 80%
    expect(r.refundsINR).toBe(500);
    expect(r.payableINR).toBe(1900); // net − refunds
    expect(r.capturedCount).toBe(2);
    expect(r.diffINR).toBe(0);
    expect(r.mismatches).toHaveLength(0);
    expect(r.balanced).toBe(true);
  });

  it('flags a settlement mismatch (wrong amount + one missing)', () => {
    const settlement: SettlementRow[] = [{ providerPaymentId: 'pay_A', amountINR: 900 }]; // wrong amount, pay_B absent
    const r = reconcile(ledger, settlement);
    expect(r.balanced).toBe(false);
    expect(r.diffINR).toBe(2100); // 3000 ledger − 900 settled
    const reasons = r.mismatches.map((m) => `${m.providerPaymentId}:${m.reason}`).sort();
    expect(reasons).toEqual(['pay_A:amount-mismatch', 'pay_B:missing-in-settlement']);
  });

  it('flags settlement rows with no matching capture (unknown-in-settlement)', () => {
    const r = reconcile(ledger, [
      { providerPaymentId: 'pay_A', amountINR: 1000 },
      { providerPaymentId: 'pay_B', amountINR: 2000 },
      { providerPaymentId: 'pay_GHOST', amountINR: 9999 },
    ]);
    expect(r.balanced).toBe(false);
    expect(r.mismatches).toEqual([{ providerPaymentId: 'pay_GHOST', reason: 'unknown-in-settlement', settlementINR: 9999 }]);
  });
});
