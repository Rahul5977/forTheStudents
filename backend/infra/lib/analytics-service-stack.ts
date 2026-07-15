// Phase 8: Analytics & Reporting. Two Lambdas, no HTTP surface. Firehose-FREE and
// crawler-FREE — everything is pay-per-use and scales to zero:
//   - AnalyticsStreamFn: DynamoDB Streams (Bookings + Mentors) → batched NDJSON → S3.
//   - AnalyticsReconcileFn: daily EventBridge schedule → fold Bookings ledger vs the
//     (owner-provided) Razorpay settlement report → flag mismatches.
// Query the S3 lake ad-hoc with Athena using partition projection (NO Glue crawler → no
// ongoing crawler cost) — see docs/analytics-athena.md. Cost: S3 (lifecycle-expired at
// 365d) + 2 scale-to-zero Lambdas + one scheduled run/day. No Firehose, no always-on infra.
import { Stack, type StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture, Tracing, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource, SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
import type * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { StageConfig } from './config';

const here = dirname(fileURLToPath(import.meta.url));

export interface AnalyticsServiceStackProps extends StackProps {
  cfg: StageConfig;
  /** Streams → S3, and read for the daily reconciliation. */
  bookingsTable: ddb.Table;
  /** Streams → S3 (mentor lifecycle facts). Needs a stream — see the data-stack edit. */
  mentorsTable: ddb.Table;
}

export class AnalyticsServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: AnalyticsServiceStackProps) {
    super(scope, id, props);
    const { cfg, bookingsTable, mentorsTable } = props;

    // ── S3 data lake ───────────────────────────────────────────────────────────
    // Private, encrypted, TLS-only, and objects self-expire at 365d so storage stays
    // tiny/cheap. autoDeleteObjects only when the bucket itself is DESTROY-able (dev/staging).
    const bucket = new s3.Bucket(this, 'AnalyticsBucket', {
      // S3 bucket names are GLOBALLY unique → scope with the account id (as the
      // Cognito Hosted-UI domain does). `sc-dev-analytics` alone collides worldwide.
      bucketName: `sc-${cfg.stage}-analytics-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(365) }],
      removalPolicy: cfg.removalPolicy,
      autoDeleteObjects: cfg.removalPolicy === RemovalPolicy.DESTROY,
    });

    const common = {
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      tracing: Tracing.ACTIVE,
      bundling: { minify: true, sourceMap: true, target: 'node20' },
      environment: {
        STAGE: cfg.stage,
        BUCKET_ANALYTICS: bucket.bucketName,
        TABLE_BOOKINGS: bookingsTable.tableName,
        POWERTOOLS_SERVICE_NAME: 'analytics',
        POWERTOOLS_METRICS_NAMESPACE: 'StudentCounselor',
      },
    };

    // ── Stream processor: Streams (Bookings + Mentors) → S3 NDJSON ──────────────
    // Poison records don't wedge the shard: bisectBatchOnError narrows to the bad record,
    // retryAttempts bounds retries, and the failed sub-batch lands in the DLQ for replay.
    const streamDlq = new sqs.Queue(this, 'AnalyticsStreamDLQ', {
      queueName: `sc-${cfg.stage}-analytics-stream-dlq`,
      retentionPeriod: Duration.days(14),
    });

    const streamFn = new NodejsFunction(this, 'AnalyticsStreamFn', {
      ...common,
      functionName: `sc-${cfg.stage}-analytics-stream`,
      entry: join(here, '../../services/analytics/src/stream.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
    });
    bucket.grantWrite(streamFn);

    const streamOpts = {
      batchSize: 100,
      startingPosition: StartingPosition.TRIM_HORIZON,
      bisectBatchOnError: true,
      retryAttempts: 3,
      onFailure: new SqsDlq(streamDlq),
    };
    streamFn.addEventSource(new DynamoEventSource(bookingsTable, streamOpts));
    streamFn.addEventSource(new DynamoEventSource(mentorsTable, streamOpts));

    // ── Reconciliation: daily EventBridge schedule → fold ledger vs settlement ──
    const reconcileFn = new NodejsFunction(this, 'AnalyticsReconcileFn', {
      ...common,
      functionName: `sc-${cfg.stage}-analytics-reconcile`,
      entry: join(here, '../../services/analytics/src/reconcile.ts'),
      handler: 'handler',
      timeout: Duration.seconds(60),
    });
    bookingsTable.grantReadData(reconcileFn);
    bucket.grantReadWrite(reconcileFn);

    new events.Rule(this, 'ReconcileSchedule', {
      ruleName: `sc-${cfg.stage}-analytics-reconcile`,
      description: 'Daily ledger vs Razorpay settlement reconciliation (Phase 8).',
      schedule: events.Schedule.rate(Duration.days(1)),
      targets: [new targets.LambdaFunction(reconcileFn)],
    });
  }
}
