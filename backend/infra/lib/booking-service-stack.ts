// Phase 5: the booking-sessions lambdalith (booking ↔ payment saga + sessions).
// Booking/session routes sit behind the Cognito authorizer; POST /payments/webhook
// is PUBLIC (provider callback — verified by signature in the handler). Reads the
// mentors table (price/slot); owns the bookings table; emits domain events.
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

export interface BookingServiceStackProps extends StackProps {
  cfg: StageConfig;
  httpApi: apigw.HttpApi;
  authorizer: HttpUserPoolAuthorizer;
  bookingsTable: ddb.Table;
  mentorsTable: ddb.Table;
}

export class BookingServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: BookingServiceStackProps) {
    super(scope, id, props);
    const { cfg, httpApi, authorizer, bookingsTable, mentorsTable } = props;

    const fn = new NodejsFunction(this, 'BookingFn', {
      functionName: `sc-${cfg.stage}-booking`,
      entry: join(here, '../../services/booking/src/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      bundling: { minify: true, sourceMap: true, target: 'node20' },
      environment: {
        STAGE: cfg.stage,
        TABLE_BOOKINGS: bookingsTable.tableName,
        TABLE_MENTORS: mentorsTable.tableName,
        EVENT_BUS_NAME: 'default',
        SECRETS_PARAM: `/sc-${cfg.stage}/secrets`, // SSM param holding Razorpay keys (name only)
        POWERTOOLS_SERVICE_NAME: 'booking',
        POWERTOOLS_METRICS_NAMESPACE: 'StudentCounselor',
      },
    });

    bookingsTable.grantReadWriteData(fn);
    mentorsTable.grantReadData(fn); // read-only: mentor price + availability slot
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [`arn:aws:events:${this.region}:${this.account}:event-bus/default`],
      }),
    );
    // Read the Razorpay keys from SSM Parameter Store (+ decrypt the SecureString via KMS).
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/sc-${cfg.stage}/secrets`],
      }),
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'], // the AWS-managed aws/ssm key; scoped tight by the ViaService condition
        conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
      }),
    );

    const integration = new HttpLambdaIntegration('BookingIntegration', fn);
    const authed: { path: string; method: apigw.HttpMethod }[] = [
      { path: '/bookings', method: apigw.HttpMethod.POST },
      { path: '/bookings/{id}', method: apigw.HttpMethod.GET },
      { path: '/bookings/{id}/cancel', method: apigw.HttpMethod.POST },
      { path: '/bookings/{id}/accept', method: apigw.HttpMethod.POST },
      { path: '/bookings/{id}/decline', method: apigw.HttpMethod.POST },
      { path: '/sessions', method: apigw.HttpMethod.GET },
      { path: '/sessions/{id}/join', method: apigw.HttpMethod.POST },
      { path: '/sessions/{id}/end', method: apigw.HttpMethod.POST },
      { path: '/sessions/{id}/rate', method: apigw.HttpMethod.POST },
    ];
    for (const r of authed) httpApi.addRoutes({ path: r.path, methods: [r.method], integration, authorizer });

    // Public provider webhook — no authorizer (signature-verified in the handler).
    httpApi.addRoutes({ path: '/payments/webhook', methods: [apigw.HttpMethod.POST], integration });
  }
}
