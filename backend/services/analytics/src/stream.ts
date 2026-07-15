// Phase 8: DynamoDB Streams → S3 data lake (Firehose-FREE — cost).
//
// Both the Bookings and Mentors tables stream NEW_AND_OLD_IMAGES. This Lambda turns a
// batch of stream records into compact NDJSON and writes one object per (table, day):
//     s3://<BUCKET_ANALYTICS>/<table>/dt=YYYY-MM-DD/<ulid>.jsonl
// Athena reads that layout ad-hoc with partition projection (no Glue crawler) — see
// docs/analytics-athena.md. No Firehose, no always-on pipeline → the only cost is the S3
// PutObjects for a batch + scale-to-zero Lambda time.
//
// `toLine()` is a PURE, unit-tested function (see test/analytics.test.ts): given one
// stream record it returns the exact JSON object we persist — so the shaping/redaction
// logic is testable without S3 or DynamoDB.
import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { getEnv } from '@sc/config';
import { createLogger, newId } from '@sc/shared';

const logger = createLogger('analytics-stream');

// Allow-list of analytically-useful attributes copied into `newImage`. Everything else
// (emails, phone numbers, OTPs, tokens, free-text comments, …) is DROPPED so the lake
// never accumulates PII — funnel/revenue analytics only needs these facts.
const IMAGE_FIELDS = [
  'status', 'type', 'priceINR', 'amountINR', 'rating', 'currency',
  'mentorId', 'studentId', 'slotId', 'startsAt', 'durationMin',
  'providerPaymentId', 'createdAt', 'updatedAt',
] as const;

/** One line of the NDJSON lake — the full shape we persist per stream record. */
export interface AnalyticsLine {
  table: string;
  eventName: string; // INSERT | MODIFY | REMOVE
  keys: Record<string, unknown>;
  newImage: Record<string, unknown>;
  ts: string; // ISO8601 (record's ApproximateCreationDateTime, or now)
}

/** Pull the DynamoDB table name out of a stream `eventSourceARN`. */
export function tableFromArn(arn?: string): string {
  // arn:aws:dynamodb:<region>:<acct>:table/<name>/stream/<ts>
  const m = arn?.match(/table\/([^/]+)/);
  return m?.[1] ?? 'unknown';
}

// aws-lambda's AttributeValue is structurally identical to the SDK's at runtime; the cast
// just satisfies the unmarshaller's types. Missing image → {}.
const un = (img?: Record<string, unknown>): Record<string, unknown> =>
  img ? unmarshall(img as Record<string, AttributeValue>) : {};

/**
 * PURE: turn one DynamoDB stream record into the compact NDJSON object we store.
 * Unmarshals Keys + NewImage, then keeps only the IMAGE_FIELDS allow-list (no PII).
 */
export function toLine(record: DynamoDBRecord): AnalyticsLine {
  const full = un(record.dynamodb?.NewImage);
  const newImage: Record<string, unknown> = {};
  for (const f of IMAGE_FIELDS) if (full[f] !== undefined) newImage[f] = full[f];

  const approx = record.dynamodb?.ApproximateCreationDateTime;
  const ts = (approx ? new Date(approx * 1000) : new Date()).toISOString();

  return {
    table: tableFromArn(record.eventSourceARN),
    eventName: record.eventName ?? 'UNKNOWN',
    keys: un(record.dynamodb?.Keys),
    newImage,
    ts,
  };
}

let s3: S3Client | null = null;
const getS3 = () => (s3 ??= new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' }));

async function putBatch(prefix: string, lines: AnalyticsLine[]): Promise<void> {
  const body = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  await getS3().send(
    new PutObjectCommand({
      Bucket: getEnv().BUCKET_ANALYTICS,
      Key: `${prefix}/${newId()}.jsonl`,
      Body: body,
      ContentType: 'application/x-ndjson',
    }),
  );
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  // Group the batch by `<table>/dt=<day>` so one PutObject lands in the right partition.
  const groups = new Map<string, AnalyticsLine[]>();
  for (const record of event.Records) {
    const line = toLine(record);
    const prefix = `${line.table}/dt=${line.ts.slice(0, 10)}`;
    const bucket = groups.get(prefix) ?? [];
    bucket.push(line);
    groups.set(prefix, bucket);
  }

  // Let a failure surface: with bisectBatchOnError + onFailure DLQ (infra), the shard
  // retries and only the poison sub-batch ends up in the DLQ for replay.
  for (const [prefix, lines] of groups) await putBatch(prefix, lines);
  logger.info('archived stream batch', { records: event.Records.length, objects: groups.size });
}
