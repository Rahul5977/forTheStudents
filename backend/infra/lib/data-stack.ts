// Phase 0/1 data: the Users table (DynamoDB, on-demand, PITR, stream).
// Other services' tables (Planner, Mentors, Bookings, Ledger, …) get added in
// their phases — see docs/architecture.md §6.
import { Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import type { StageConfig } from './config';

export interface DataStackProps extends StackProps {
  cfg: StageConfig;
}

export class DataStack extends Stack {
  readonly usersTable: ddb.Table;
  readonly catalogTable: ddb.Table;
  readonly plannerTable: ddb.Table;

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
  }
}
