// Phase 4: the marketplace-mentors lambdalith. Mentor + admin routes sit behind
// the Cognito authorizer; GET /mentors is PUBLIC (a browse surface). Emits domain
// events (mentor.applied / .submitted / .approved / .rejected) to the default bus.
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

export interface MarketplaceServiceStackProps extends StackProps {
  cfg: StageConfig;
  httpApi: apigw.HttpApi;
  authorizer: HttpUserPoolAuthorizer;
  mentorsTable: ddb.Table;
}

export class MarketplaceServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: MarketplaceServiceStackProps) {
    super(scope, id, props);
    const { cfg, httpApi, authorizer, mentorsTable } = props;

    const fn = new NodejsFunction(this, 'MarketplaceFn', {
      functionName: `sc-${cfg.stage}-marketplace`,
      entry: join(here, '../../services/marketplace/src/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      bundling: { minify: true, sourceMap: true, target: 'node20' },
      environment: {
        STAGE: cfg.stage,
        TABLE_MENTORS: mentorsTable.tableName,
        EVENT_BUS_NAME: 'default',
        POWERTOOLS_SERVICE_NAME: 'marketplace',
        POWERTOOLS_METRICS_NAMESPACE: 'StudentCounselor',
      },
    });

    mentorsTable.grantReadWriteData(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [`arn:aws:events:${this.region}:${this.account}:event-bus/default`],
      }),
    );

    const integration = new HttpLambdaIntegration('MarketplaceIntegration', fn);
    // Authed routes (mentor self-service + admin queue).
    const authed: { path: string; method: apigw.HttpMethod }[] = [
      { path: '/mentor/apply', method: apigw.HttpMethod.POST },
      { path: '/mentor/verify/email', method: apigw.HttpMethod.POST },
      { path: '/mentor/verify/id', method: apigw.HttpMethod.POST },
      { path: '/mentor/profile', method: apigw.HttpMethod.GET },
      { path: '/mentor/profile', method: apigw.HttpMethod.PUT },
      { path: '/mentor/availability', method: apigw.HttpMethod.GET },
      { path: '/mentor/availability', method: apigw.HttpMethod.PUT },
      { path: '/admin/mentors/pending', method: apigw.HttpMethod.GET },
      { path: '/admin/mentors/{id}/review', method: apigw.HttpMethod.POST },
      { path: '/admin/mentors/{id}/interview', method: apigw.HttpMethod.POST },
    ];
    for (const r of authed) httpApi.addRoutes({ path: r.path, methods: [r.method], integration, authorizer });

    // Public browse — no authorizer.
    httpApi.addRoutes({ path: '/mentors', methods: [apigw.HttpMethod.GET], integration });
    httpApi.addRoutes({ path: '/mentors/{id}/slots', methods: [apigw.HttpMethod.GET], integration }); // a mentor's open slots
  }
}
