// Phase 0/9: one-screen operations view + a spend guardrail.
// - CloudWatch Dashboard `sc-<stage>`: API Gateway, Lambda, and DynamoDB health.
// - AWS Budget: emails you if monthly spend crosses the threshold.
import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import type * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import type { StageConfig } from './config';

export interface ObservabilityStackProps extends StackProps {
  cfg: StageConfig;
  httpApi: apigw.HttpApi;
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { cfg, httpApi } = props;

    const period = Duration.minutes(5);
    const authFn = `sc-${cfg.stage}-auth-identity`;
    const catalogFn = `sc-${cfg.stage}-catalog`;
    const plannerFn = `sc-${cfg.stage}-planner`;
    const marketplaceFn = `sc-${cfg.stage}-marketplace`;
    const bookingFn = `sc-${cfg.stage}-booking`;
    const notifConsumerFn = `sc-${cfg.stage}-notifications-consumer`;
    const dlqName = `sc-${cfg.stage}-notifications-dlq`;
    const tableName = `sc-${cfg.stage}-users`;
    const apiId = httpApi.apiId;

    // ── metric helpers ────────────────────────────────────────────────────────
    const api = (metricName: string, statistic: string, label?: string) =>
      new cw.Metric({ namespace: 'AWS/ApiGateway', metricName, dimensionsMap: { ApiId: apiId }, statistic, period, label });
    const lamFor = (fn: string) => (metricName: string, statistic: string, label?: string) =>
      new cw.Metric({ namespace: 'AWS/Lambda', metricName, dimensionsMap: { FunctionName: fn }, statistic, period, label });
    const lam = lamFor(authFn); // default = auth-identity (kept for existing widgets)
    const cat = lamFor(catalogFn);
    const plan = lamFor(plannerFn);
    const mkt = lamFor(marketplaceFn);
    const bkg = lamFor(bookingFn);
    const ntf = lamFor(notifConsumerFn);
    const dlqDepth = new cw.Metric({ namespace: 'AWS/SQS', metricName: 'ApproximateNumberOfMessagesVisible', dimensionsMap: { QueueName: dlqName }, statistic: 'Maximum', period });
    const ddb = (metricName: string, statistic: string, dims: Record<string, string> = {}, label?: string) =>
      new cw.Metric({ namespace: 'AWS/DynamoDB', metricName, dimensionsMap: { TableName: tableName, ...dims }, statistic, period, label });

    const dashboard = new cw.Dashboard(this, 'Dashboard', {
      dashboardName: `sc-${cfg.stage}`,
      defaultInterval: Duration.hours(3),
    });

    // Row 0 — at-a-glance error counters (last period).
    dashboard.addWidgets(
      new cw.SingleValueWidget({ title: 'API 5xx (sum)', metrics: [api('5xx', 'Sum')], width: 6, height: 4 }),
      new cw.SingleValueWidget({ title: 'API 4xx (sum)', metrics: [api('4xx', 'Sum')], width: 6, height: 4 }),
      new cw.SingleValueWidget({ title: 'Lambda errors (sum)', metrics: [lam('Errors', 'Sum')], width: 6, height: 4 }),
      new cw.SingleValueWidget({ title: 'Lambda throttles (sum)', metrics: [lam('Throttles', 'Sum')], width: 6, height: 4 }),
    );

    // Row 1 — API Gateway.
    dashboard.addWidgets(
      new cw.GraphWidget({ title: 'API — requests & errors', left: [api('Count', 'Sum', 'requests'), api('4xx', 'Sum', '4xx'), api('5xx', 'Sum', '5xx')], width: 12, height: 6 }),
      new cw.GraphWidget({ title: 'API — latency (ms)', left: [api('Latency', 'Average', 'avg'), api('Latency', 'p95', 'p95'), api('IntegrationLatency', 'p95', 'integ p95')], width: 12, height: 6 }),
    );

    // Row 2 — Lambda (auth-identity).
    dashboard.addWidgets(
      new cw.GraphWidget({ title: 'Lambda — invocations / errors / throttles', left: [lam('Invocations', 'Sum'), lam('Errors', 'Sum'), lam('Throttles', 'Sum')], width: 12, height: 6 }),
      new cw.GraphWidget({ title: 'Lambda — duration (ms) & concurrency', left: [lam('Duration', 'Average', 'avg'), lam('Duration', 'p95', 'p95')], right: [lam('ConcurrentExecutions', 'Maximum', 'concurrent')], width: 12, height: 6 }),
    );

    // Row 3 — Catalog Lambda (predictor).
    dashboard.addWidgets(
      new cw.GraphWidget({ title: 'Catalog — invocations / errors / throttles', left: [cat('Invocations', 'Sum'), cat('Errors', 'Sum'), cat('Throttles', 'Sum')], width: 12, height: 6 }),
      new cw.GraphWidget({ title: 'Catalog — duration (ms)', left: [cat('Duration', 'Average', 'avg'), cat('Duration', 'p95', 'p95'), cat('Duration', 'Maximum', 'max (cold)')], width: 12, height: 6 }),
    );

    // Row 3b — Planner + Marketplace + Booking Lambdas (Phase 3/4/5).
    dashboard.addWidgets(
      new cw.GraphWidget({ title: 'Planner — invocations / errors / throttles', left: [plan('Invocations', 'Sum'), plan('Errors', 'Sum'), plan('Throttles', 'Sum')], width: 8, height: 6 }),
      new cw.GraphWidget({ title: 'Marketplace — invocations / errors / throttles', left: [mkt('Invocations', 'Sum'), mkt('Errors', 'Sum'), mkt('Throttles', 'Sum')], width: 8, height: 6 }),
      new cw.GraphWidget({ title: 'Booking — invocations / errors / throttles', left: [bkg('Invocations', 'Sum'), bkg('Errors', 'Sum'), bkg('Throttles', 'Sum')], width: 8, height: 6 }),
    );
    dashboard.addWidgets(
      new cw.GraphWidget({ title: 'Notifications consumer — invocations / errors', left: [ntf('Invocations', 'Sum'), ntf('Errors', 'Sum')], width: 12, height: 6 }),
      new cw.GraphWidget({ title: 'Notifications DLQ depth (should be 0)', left: [dlqDepth], width: 12, height: 6 }),
    );

    // Row 4 — DynamoDB (Users).
    dashboard.addWidgets(
      new cw.GraphWidget({ title: 'DynamoDB — consumed capacity (units)', left: [ddb('ConsumedReadCapacityUnits', 'Sum', {}, 'read'), ddb('ConsumedWriteCapacityUnits', 'Sum', {}, 'write')], width: 12, height: 6 }),
      new cw.GraphWidget({
        title: 'DynamoDB — request latency (ms)',
        left: ['GetItem', 'PutItem', 'UpdateItem'].map((op) => ddb('SuccessfulRequestLatency', 'Average', { Operation: op }, op)),
        width: 12, height: 6,
      }),
    );

    // ── Alarms → SNS email: page you when something is actually broken ─────────
    // One topic, email-subscribed. Alarms fire on real breakage, not on quiet periods
    // (missing data = not breaching, so scale-to-zero never trips a false alarm).
    const alerts = new sns.Topic(this, 'AlertsTopic', { topicName: `sc-${cfg.stage}-alerts` });
    alerts.addSubscription(new subscriptions.EmailSubscription(cfg.alertEmail));
    const action = new cwActions.SnsAction(alerts);

    const alarm = (id: string, metric: cw.Metric, threshold: number, evalPeriods: number, desc: string) => {
      const a = new cw.Alarm(this, id, {
        alarmName: `sc-${cfg.stage}-${id}`,
        alarmDescription: desc,
        metric,
        threshold,
        evaluationPeriods: evalPeriods,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });
      a.addAlarmAction(action);
      a.addOkAction(action);
      return a;
    };

    alarm('api-5xx', api('5xx', 'Sum'), 5, 1, 'API Gateway returned ≥5 server errors in 5 min');
    alarm('auth-errors', lam('Errors', 'Sum'), 3, 1, 'auth-identity Lambda errored ≥3 times in 5 min');
    alarm('catalog-errors', cat('Errors', 'Sum'), 3, 1, 'catalog Lambda errored ≥3 times in 5 min');
    alarm('planner-errors', plan('Errors', 'Sum'), 3, 1, 'planner Lambda errored ≥3 times in 5 min');
    alarm('marketplace-errors', mkt('Errors', 'Sum'), 3, 1, 'marketplace Lambda errored ≥3 times in 5 min');
    alarm('booking-errors', bkg('Errors', 'Sum'), 3, 1, 'booking Lambda errored ≥3 times in 5 min');
    alarm('notif-consumer-errors', ntf('Errors', 'Sum'), 3, 1, 'notifications consumer errored ≥3 times in 5 min');
    alarm('notif-dlq', dlqDepth, 1, 1, 'a domain event landed in the notifications DLQ (failed 3x) — investigate');
    alarm('lambda-throttle', lam('Throttles', 'Sum'), 1, 1, 'auth-identity Lambda was throttled (concurrency ceiling)');
    alarm('api-latency', api('Latency', 'p95'), 3000, 2, 'API p95 latency ≥3s for 10 min');

    // ── Budget: alert when monthly spend crosses the threshold ────────────────
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `sc-${cfg.stage}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: cfg.monthlyBudgetUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        {
          notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 50, thresholdType: 'PERCENTAGE' },
          subscribers: [{ subscriptionType: 'EMAIL', address: cfg.alertEmail }],
        },
        {
          notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 80, thresholdType: 'PERCENTAGE' },
          subscribers: [{ subscriptionType: 'EMAIL', address: cfg.alertEmail }],
        },
        {
          notification: { notificationType: 'FORECASTED', comparisonOperator: 'GREATER_THAN', threshold: 100, thresholdType: 'PERCENTAGE' },
          subscribers: [{ subscriptionType: 'EMAIL', address: cfg.alertEmail }],
        },
      ],
    });
  }
}
