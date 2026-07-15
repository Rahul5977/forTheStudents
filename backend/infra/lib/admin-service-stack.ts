// Phase 7: the admin-ops lambdalith. Every route sits behind the Cognito authorizer
// AND requires role=admin (enforced in the domain). Reads cheap counters off the mentors
// GSI, moderates mentor status (guarded updates), writes an append-only audit trail, and
// emits 'admin.broadcast' events to the default bus (→ notifications fanout).
import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import type * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { StageConfig } from './config';

const here = dirname(fileURLToPath(import.meta.url));

export interface AdminServiceStackProps extends StackProps {
  cfg: StageConfig;
  httpApi: apigw.HttpApi;
  authorizer: HttpUserPoolAuthorizer;
  auditTable: ddb.Table;
  mentorsTable: ddb.Table;
}

export class AdminServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: AdminServiceStackProps) {
    super(scope, id, props);
    const { cfg, httpApi, authorizer, auditTable, mentorsTable } = props;

    const fn = new NodejsFunction(this, 'AdminFn', {
      functionName: `sc-${cfg.stage}-admin`,
      entry: join(here, '../../services/admin/src/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      bundling: { minify: true, sourceMap: true, target: 'node20' },
      environment: {
        STAGE: cfg.stage,
        TABLE_AUDIT: auditTable.tableName,
        TABLE_MENTORS: mentorsTable.tableName,
        EVENT_BUS_NAME: 'default',
        POWERTOOLS_SERVICE_NAME: 'admin',
        POWERTOOLS_METRICS_NAMESPACE: 'StudentCounselor',
      },
    });

    auditTable.grantReadWriteData(fn);
    mentorsTable.grantReadWriteData(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [`arn:aws:events:${this.region}:${this.account}:event-bus/default`],
      }),
    );

    const integration = new HttpLambdaIntegration('AdminIntegration', fn);
    // All admin routes: authorizer + role=admin (checked in the domain).
    const authed: { path: string; method: apigw.HttpMethod }[] = [
      { path: '/admin/stats', method: apigw.HttpMethod.GET },
      { path: '/admin/audit', method: apigw.HttpMethod.GET },
      { path: '/admin/mentors/{id}/suspend', method: apigw.HttpMethod.POST },
      { path: '/admin/mentors/{id}/reinstate', method: apigw.HttpMethod.POST },
      { path: '/admin/broadcast', method: apigw.HttpMethod.POST },
    ];
    for (const r of authed) httpApi.addRoutes({ path: r.path, methods: [r.method], integration, authorizer });
  }
}
