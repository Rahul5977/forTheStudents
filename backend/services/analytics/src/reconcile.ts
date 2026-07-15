// Phase 8: daily ledger reconciliation (one scheduled Lambda/day — cost).
//
// Money truth = the append-only Bookings ledger (LEDGER#<bookingId> / EVT#<providerEvtId>,
// written exactly-once by the booking saga). Each day we fold that ledger and diff it
// against the Razorpay *settlement report* (what actually hit our bank), flagging any
// mismatch so finance/on-call can investigate before it compounds.
//
// `reconcile()` is a PURE, unit-tested function: given the day's ledger entries + the
// settlement rows it returns gross / fee / net / refunds + a list of mismatches. The
// handler just does the I/O (read ledger, fetch settlement, log the summary).
import type { ScheduledEvent } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getEnv } from '@sc/config';
import { ddb, createLogger } from '@sc/shared';

const logger = createLogger('analytics-reconcile');

// Platform + gateway fee. Mentors keep 80%; we retain 20%. (Owner: confirm the real split
// — Razorpay MDR + platform commission — and move to config if it ever varies by mentor.)
const FEE_RATE = 0.2;

/** A folded Bookings ledger row (subset we need to reconcile). */
export interface LedgerEntry {
  bookingId?: string;
  /** 'order.created' | 'payment.captured' | 'payment.failed' | 'refund.issued' */
  type: string;
  amountINR?: number;
  /** Razorpay payment/refund id — the exactly-once key that also joins to the settlement. */
  providerPaymentId?: string;
}

/** One row of the Razorpay settlement report (owner-provided — see fetchSettlement). */
export interface SettlementRow {
  providerPaymentId: string;
  amountINR: number;
}

export type MismatchReason = 'missing-in-settlement' | 'amount-mismatch' | 'unknown-in-settlement';

export interface Mismatch {
  providerPaymentId: string;
  reason: MismatchReason;
  ledgerINR?: number;
  settlementINR?: number;
}

export interface ReconcileResult {
  grossINR: number; // Σ captured payments
  feeINR: number; // 20% of gross
  netINR: number; // 80% of gross (after fee)
  refundsINR: number; // Σ refunds issued
  payableINR: number; // net − refunds (what we owe out, roughly)
  capturedCount: number;
  settledGrossINR: number; // Σ from the settlement report
  diffINR: number; // ledger gross − settlement gross
  mismatches: Mismatch[]; // per-payment discrepancies
  balanced: boolean; // no mismatches and diff == 0
}

const amt = (e: { amountINR?: number }): number => e.amountINR ?? 0;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * PURE: fold the day's ledger + diff it against the settlement report.
 * @param ledgerEntries the day's Bookings ledger rows
 * @param settlement    Razorpay settlement rows (empty until the owner wires the report)
 */
export function reconcile(ledgerEntries: LedgerEntry[], settlement: SettlementRow[]): ReconcileResult {
  const captures = ledgerEntries.filter((e) => e.type === 'payment.captured');
  const refunds = ledgerEntries.filter((e) => e.type === 'refund.issued');

  const grossINR = sum(captures.map(amt));
  const refundsINR = sum(refunds.map(amt));
  const feeINR = Math.round(grossINR * FEE_RATE);
  const netINR = grossINR - feeINR;
  const payableINR = netINR - refundsINR;

  const settledById = new Map(settlement.map((s) => [s.providerPaymentId, s]));
  const capturedIds = new Set(captures.map((c) => c.providerPaymentId).filter(Boolean) as string[]);

  const mismatches: Mismatch[] = [];
  // Every captured payment must appear in the settlement, for the same amount.
  for (const c of captures) {
    if (!c.providerPaymentId) continue; // unkeyed capture — can't join to a settlement row
    const s = settledById.get(c.providerPaymentId);
    if (!s) {
      mismatches.push({ providerPaymentId: c.providerPaymentId, reason: 'missing-in-settlement', ledgerINR: amt(c) });
    } else if (s.amountINR !== amt(c)) {
      mismatches.push({ providerPaymentId: c.providerPaymentId, reason: 'amount-mismatch', ledgerINR: amt(c), settlementINR: s.amountINR });
    }
  }
  // Settlement rows we have no ledger capture for → money we can't explain.
  for (const s of settlement) {
    if (!capturedIds.has(s.providerPaymentId)) {
      mismatches.push({ providerPaymentId: s.providerPaymentId, reason: 'unknown-in-settlement', settlementINR: s.amountINR });
    }
  }

  const settledGrossINR = sum(settlement.map((s) => s.amountINR));
  const diffINR = grossINR - settledGrossINR;
  const balanced = mismatches.length === 0 && diffINR === 0;

  return { grossINR, feeINR, netINR, refundsINR, payableINR, capturedCount: captures.length, settledGrossINR, diffINR, mismatches, balanced };
}

/**
 * Fetch the Razorpay settlement report for a day. STUB — returns [].
 * TODO(owner): call the Razorpay Settlements API (or ingest the daily settlement report
 * CSV the owner drops in S3) and map each settled transaction to a SettlementRow:
 *   input:  dt = 'YYYY-MM-DD'
 *   output: SettlementRow[] = [{ providerPaymentId: 'pay_XXX', amountINR: 1200 }, …]
 * Auth via the Razorpay key id/secret in Secrets Manager (NEVER in code). Until then the
 * job runs with an empty settlement → every capture flags as 'missing-in-settlement',
 * which is the correct "not yet reconciled" signal.
 */
async function fetchSettlement(_dt: string): Promise<SettlementRow[]> {
  return [];
}

/**
 * Read the day's ledger rows. MINIMAL on purpose (see architecture.md §analytics):
 * the ledger is keyed by booking (PK=LEDGER#<id>, no date index), so a filtered Scan is
 * the cheap answer at off-season/dev volume. At real scale, prefer the Streams→S3→Athena
 * lake (stream.ts) or add a date GSI — a daily Scan of a small table is fine and pay-per-use.
 */
async function readLedgerForDay(dt: string): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: getEnv().TABLE_BOOKINGS,
        FilterExpression: 'begins_with(PK, :led) AND begins_with(#at, :dt)',
        ExpressionAttributeNames: { '#at': 'at' },
        ExpressionAttributeValues: { ':led': 'LEDGER#', ':dt': dt },
        ExclusiveStartKey,
      }),
    );
    for (const it of res.Items ?? []) {
      entries.push({
        bookingId: typeof it.PK === 'string' ? it.PK.replace('LEDGER#', '') : undefined,
        type: String(it.type),
        amountINR: typeof it.amountINR === 'number' ? it.amountINR : undefined,
        providerPaymentId: typeof it.providerPaymentId === 'string' ? it.providerPaymentId : undefined,
      });
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return entries;
}

/** Daily EventBridge schedule → reconcile the previous-day's ledger vs the settlement. */
export async function handler(event: ScheduledEvent): Promise<ReconcileResult> {
  const dt = (event.time ?? new Date().toISOString()).slice(0, 10);
  const ledger = await readLedgerForDay(dt);
  const settlement = await fetchSettlement(dt);
  const result = reconcile(ledger, settlement);

  // Structured summary line (CloudWatch Logs Insights / a metric filter can chart it).
  logger.info('reconciliation summary', {
    event: 'reconciliation.summary', dt,
    grossINR: result.grossINR, feeINR: result.feeINR, netINR: result.netINR,
    refundsINR: result.refundsINR, payableINR: result.payableINR,
    capturedCount: result.capturedCount, diffINR: result.diffINR,
    mismatches: result.mismatches.length, balanced: result.balanced,
  });

  if (!result.balanced) {
    // Loud, filterable line → Phase 9 alarm (metric filter: { $.event = "reconciliation.mismatch" }).
    logger.warn('reconciliation MISMATCH', { event: 'reconciliation.mismatch', dt, diffINR: result.diffINR, mismatches: result.mismatches });
    // TODO(owner): emit a CloudWatch metric + page on-call (architecture.md §monitoring).
  }
  return result;
}
