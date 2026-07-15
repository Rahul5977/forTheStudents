// Phase 6: notifications. Two Lambdas share one table:
//   - NotificationsFn: the feed API (authed).
//   - NotificationsConsumerFn: EventBridge (domain events) → SQS (buffer+DLQ) → here.
// Everything is pay-per-use (SQS, EventBridge, Lambda, on-demand DDB) → ₹0 at idle.
import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import type * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { StageConfig } from './config';

const here = dirname(fileURLToPath(import.meta.url));

export interface NotificationsServiceStackProps extends StackProps {
  cfg: StageConfig;
  httpApi: apigw.HttpApi;
  authorizer: HttpUserPoolAuthorizer;
  notificationsTable: ddb.Table;
}

export class NotificationsServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: NotificationsServiceStackProps) {
    super(scope, id, props);
    const { cfg, httpApi, authorizer, notificationsTable } = props;

    const common = {
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      bundling: { minify: true, sourceMap: true, target: 'node20' },
      environment: {
        STAGE: cfg.stage,
        TABLE_NOTIFICATIONS: notificationsTable.tableName,
        POWERTOOLS_SERVICE_NAME: 'notifications',
        POWERTOOLS_METRICS_NAMESPACE: 'StudentCounselor',
      },
    };

    // ── Feed API (authed) ──────────────────────────────────────────────────────
    const apiFn = new NodejsFunction(this, 'NotificationsFn', {
      ...common,
      functionName: `sc-${cfg.stage}-notifications`,
      entry: join(here, '../../services/notifications/src/handler.ts'),
      handler: 'handler',
    });
    notificationsTable.grantReadWriteData(apiFn);
    const integration = new HttpLambdaIntegration('NotificationsIntegration', apiFn);
    const routes: { path: string; method: apigw.HttpMethod }[] = [
      { path: '/notifications', method: apigw.HttpMethod.GET },
      { path: '/notifications/read-all', method: apigw.HttpMethod.POST },
      { path: '/notifications/{id}/read', method: apigw.HttpMethod.POST },
      { path: '/notifications/prefs', method: apigw.HttpMethod.GET },
      { path: '/notifications/prefs', method: apigw.HttpMethod.PUT },
    ];
    for (const r of routes) httpApi.addRoutes({ path: r.path, methods: [r.method], integration, authorizer });

    // ── Event pipeline: EventBridge → SQS (+DLQ) → consumer ────────────────────
    const dlq = new sqs.Queue(this, 'NotificationsDLQ', {
      queueName: `sc-${cfg.stage}-notifications-dlq`,
      retentionPeriod: Duration.days(14),
    });
    const queue = new sqs.Queue(this, 'NotificationsQueue', {
      queueName: `sc-${cfg.stage}-notifications`,
      visibilityTimeout: Duration.seconds(60),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    // Fan every domain event (source starts with "sc.") to the queue.
    new events.Rule(this, 'DomainEventsRule', {
      ruleName: `sc-${cfg.stage}-domain-events`,
      eventPattern: { source: events.Match.prefix('sc.') },
      targets: [new targets.SqsQueue(queue)],
    });

    const consumerFn = new NodejsFunction(this, 'NotificationsConsumerFn', {
      ...common,
      functionName: `sc-${cfg.stage}-notifications-consumer`,
      entry: join(here, '../../services/notifications/src/consumer.ts'),
      handler: 'handler',
    });
    notificationsTable.grantReadWriteData(consumerFn);
    consumerFn.addEventSource(new SqsEventSource(queue, { batchSize: 10, reportBatchItemFailures: true }));
  }
}
