// Phase 0/1 data: the Users table (DynamoDB, on-demand, PITR, stream).
// Other services' tables (Planner, Mentors, Bookings, Ledger, …) get added in
// their phases — see docs/architecture.md §6.
import { Stack, RemovalPolicy, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Duration, CfnOutput } from 'aws-cdk-lib';
import type { StageConfig } from './config';

export interface DataStackProps extends StackProps {
  cfg: StageConfig;
}

export class DataStack extends Stack {
  readonly usersTable: ddb.Table;
  readonly catalogTable: ddb.Table;
  readonly plannerTable: ddb.Table;
  readonly mentorsTable: ddb.Table;
  readonly bookingsTable: ddb.Table;
  readonly notificationsTable: ddb.Table;
  readonly auditTable: ddb.Table;
  /** Phase 11: PRIVATE mentor ID-document store (presigned PUT/GET only). */
  readonly mentorDocsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { cfg } = props;

    // Catalog: college-branch offerings + cutoffs, versioned.
    //   Offerings  PK=CATALOG#<version>  SK=OFFERING#<id>
    //   Active ptr PK=CONFIG             SK=ACTIVE (attr: version)
    // Read-heavy + tiny → on-demand, and the predictor caches it in Lambda memory.
    this.catalogTable = new ddb.Table(this, 'Catalog', {
      tableName: `sc-${cfg.stage}-catalog`,
      partitionKey: { name: 'PK', type: ddb.AttributeType.STRING },
      sortKey: { name: 'SK', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cfg.removalPolicy,
    });

    // Planner (Phase 3): per-user shortlist + ordered choice list.
    //   PK=USER#<id>  SK=SHORTLIST | CHOICELIST  (attrs: ids[], version, updatedAt)
    // Tiny per-user writes with optimistic concurrency → on-demand scales to zero.
    this.plannerTable = new ddb.Table(this, 'Planner', {
      tableName: `sc-${cfg.stage}-planner`,
      partitionKey: { name: 'PK', type: ddb.AttributeType.STRING },
      sortKey: { name: 'SK', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cfg.removalPolicy,
    });

    // Mentors (Phase 4): PK=MENTOR#<id> SK=PROFILE|AVAILABILITY|EMAILOTP.
    //   gsi1-status (sparse): gsi1pk=`MENTOR#<STATUS>` → approved search + admin queue.
    // OTP rows expire via TTL. On-demand + PITR like the rest.
    this.mentorsTable = new ddb.Table(this, 'Mentors', {
      tableName: `sc-${cfg.stage}-mentors`,
      partitionKey: { name: 'PK', type: ddb.AttributeType.STRING },
      sortKey: { name: 'SK', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cfg.removalPolicy,
      timeToLiveAttribute: 'ttl', // ephemeral email-OTP rows
      stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES, // Phase 8: mentor lifecycle facts → analytics lake
    });
    this.mentorsTable.addGlobalSecondaryIndex({
      indexName: 'gsi1-status',
      partitionKey: { name: 'gsi1pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.ALL,
    });

    // Bookings (Phase 5): PK=BOOKING#<id> SK=META (+ SLOT#/IDEMP#/LEDGER# rows).
    //   gsi1-student (USER#<id>) → my sessions · gsi2-mentor (MENTOR#<id>) → mentor's.
    // TTL auto-releases unpaid PENDING_PAYMENT holds. Stream → analytics/notifications.
    this.bookingsTable = new ddb.Table(this, 'Bookings', {
      tableName: `sc-${cfg.stage}-bookings`,
      partitionKey: { name: 'PK', type: ddb.AttributeType.STRING },
      sortKey: { name: 'SK', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cfg.removalPolicy,
      timeToLiveAttribute: 'ttl',
      stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES, // money truth → analytics/reconciliation
    });
    this.bookingsTable.addGlobalSecondaryIndex({
      indexName: 'gsi1-student',
      partitionKey: { name: 'gsi1pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.ALL,
    });
    this.bookingsTable.addGlobalSecondaryIndex({
      indexName: 'gsi2-mentor',
      partitionKey: { name: 'gsi2pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.ALL,
    });
    // gsi3-byday: admin console reads bookings per DAY (gsi3pk = BK#<yyyymmdd>) so admin
    // queries hit small, non-hot partitions — scale-safe at peak, unlike a single ALL# key.
    this.bookingsTable.addGlobalSecondaryIndex({
      indexName: 'gsi3-byday',
      partitionKey: { name: 'gsi3pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'gsi3sk', type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.ALL,
    });

    // Notifications (Phase 6): PK=USER#<id> SK=NOTIF#<ulid> | PREFS. In-app feed.
    // TTL expires old items (bounded storage). On-demand → ₹0 at idle.
    this.notificationsTable = new ddb.Table(this, 'Notifications', {
      tableName: `sc-${cfg.stage}-notifications`,
      partitionKey: { name: 'PK', type: ddb.AttributeType.STRING },
      sortKey: { name: 'SK', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cfg.removalPolicy,
      timeToLiveAttribute: 'ttl',
    });

    // Audit (Phase 7): append-only admin action trail.
    //   PK=ADMIN#<adminId>  SK=ACT#<ts>  (ts = `${iso}#${ulid}` → time-sortable, collision-safe)
    // Immutable rows (Put only — never updated/deleted). On-demand + PITR; no stream/TTL
    // (retained for compliance). A cross-admin/by-entity view (`GSI1: entity`, arch §6.2) is deferred.
    this.auditTable = new ddb.Table(this, 'Audit', {
      tableName: `sc-${cfg.stage}-audit`,
      partitionKey: { name: 'PK', type: ddb.AttributeType.STRING },
      sortKey: { name: 'SK', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cfg.removalPolicy,
    });

    // Users: PK=USER#<id>, SK=PROFILE. Sparse GSIs for email/phone lookup.
    this.usersTable = new ddb.Table(this, 'Users', {
      tableName: `sc-${cfg.stage}-users`,
      partitionKey: { name: 'PK', type: ddb.AttributeType.STRING },
      sortKey: { name: 'SK', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST, // scales to zero off-season
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES, // for analytics/notifications later
      removalPolicy: cfg.removalPolicy,
      timeToLiveAttribute: 'ttl', // used by ephemeral items (e.g. OTP staging)
    });

    // GSI1: look up a user by email (sparse — only items with `email`).
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'gsi1-email',
      partitionKey: { name: 'email', type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.KEYS_ONLY,
    });

    // GSI2: look up a user by phone.
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'gsi2-phone',
      partitionKey: { name: 'phone', type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.KEYS_ONLY,
    });

    // Phase 11: mentor ID documents — sensitive personal data of (often) minors.
    //   PRIVATE (block-all-public-access), SSE-S3, versioned, CORS for the app origins (the
    //   browser PUTs straight to a presigned URL), lifecycle: objects tagged status=rejected
    //   (hard-rejected applications) expire after 90 days; old versions after 30 days.
    //   Keys are SERVER-generated: mentors/<userId>/<docType>/<ulid>.<ext>. Never a public URL.
    this.mentorDocsBucket = new s3.Bucket(this, 'MentorDocs', {
      bucketName: `sc-${cfg.stage}-mentor-docs-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cfg.removalPolicy,
      autoDeleteObjects: cfg.removalPolicy === RemovalPolicy.DESTROY,
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
        allowedOrigins: cfg.corsOrigins,
        allowedHeaders: ['*'],
        exposedHeaders: ['ETag'],
        maxAge: 3600,
      }],
      lifecycleRules: [
        { id: 'expire-rejected', tagFilters: { status: 'rejected' }, expiration: Duration.days(90) },
        { id: 'expire-old-versions', noncurrentVersionExpiration: Duration.days(30) },
        { id: 'abort-incomplete-uploads', abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
    });
    new CfnOutput(this, 'MentorDocsBucketName', { value: this.mentorDocsBucket.bucketName });
  }
}
