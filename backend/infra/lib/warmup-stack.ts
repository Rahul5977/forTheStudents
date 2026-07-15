// Phase 10 (OPTIONAL): cold-start warmers for the hot Lambdas during the peak window.
//
// COST + BEHAVIOUR CONTRACT — read this before flipping the flag:
//   • This stack is only instantiated in bin/app.ts when `cfg.enableWarmers === true`
//     (default FALSE for every stage). When the flag is off the stack is never created.
//   • As a second belt-and-braces guard, the constructor body ALSO early-returns unless
//     the flag is on — so even if someone wires the stack in unconditionally it creates
//     ZERO resources → ZERO idle cost.
//   • When ON: one EventBridge rule fires every 5 min and invokes each hot Lambda with a
//     synthetic HTTP GET event. The Hono handler answers it like any request (200/401/404
//     — never throws) so the container stays warm WITHOUT tripping the `*-errors` alarms.
//   • Cost when ON is tiny but non-zero: ~12 invocations/hr × N lambdas × 24h ≈ a few
//     thousand short invocations/month — cents at most, still well inside the free tier at
//     dev volume. It is OFF by default because 10 months of the year there is no traffic to
//     keep warm; turn it on only for the Jun–Jul JoSAA window (see docs/go-live.md).
//   • The heavier cold-start lever (scheduled PROVISIONED CONCURRENCY on Jun–Jul) lives in
//     Phase 9 / `cfg.provisionedConcurrency`; warmers are the cheap complement to it.
import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import type { StageConfig } from './config';

export interface WarmupStackProps extends StackProps {
  cfg: StageConfig;
}

export class WarmupStack extends Stack {
  constructor(scope: Construct, id: string, props: WarmupStackProps) {
    super(scope, id, props);
    const { cfg } = props;

    // Belt-and-braces: no resources unless explicitly enabled → ₹0 idle guarantee.
    if (!cfg.enableWarmers) return;

    // The hottest cold-start-sensitive paths. Public predictor first (highest shared load
    // right after a round result publishes), then auth + planner (the logged-in ramp).
    const hotFns = [
      `sc-${cfg.stage}-catalog`, // predictor — the shared, spiky hot path
      `sc-${cfg.stage}-auth-identity`, // login → /me bootstrap on the ramp
      `sc-${cfg.stage}-planner`, // choice-list edits during peak
    ];

    // A minimal, well-formed API Gateway v2 (HTTP API) event. The Hono adapter handles it
    // as a normal GET; unknown/authed routes return a clean 4xx (NOT a Lambda error), so a
    // ping never pages you. TODO(owner): if you add a dedicated lightweight `/health` route
    // per service, point `rawPath` at it so warmers do zero real work.
    const pingEvent = {
      version: '2.0',
      routeKey: 'GET /predict/summary',
      rawPath: '/predict/summary',
      rawQueryString: 'advRank=1&mainRank=1&category=Open&home=NA',
      headers: { 'x-warmer': 'sc-warmup', 'user-agent': 'sc-warmup' },
      requestContext: {
        http: { method: 'GET', path: '/predict/summary', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'sc-warmup' },
        routeKey: 'GET /predict/summary',
        stage: '$default',
      },
      isBase64Encoded: false,
    };

    const rule = new events.Rule(this, 'WarmupRule', {
      ruleName: `sc-${cfg.stage}-warmup`,
      description: 'Peak-window cold-start warmers for the hot Lambdas (season-gated).',
      // 5 min keeps Lambda execution environments alive without churn.
      schedule: events.Schedule.rate(Duration.minutes(5)),
    });

    for (const fnName of hotFns) {
      // Look up the already-deployed function by name (owned by its service stack).
      const fn = lambda.Function.fromFunctionName(this, `Hot-${fnName}`, fnName);
      rule.addTarget(
        new targets.LambdaFunction(fn, {
          event: events.RuleTargetInput.fromObject(pingEvent),
          retryAttempts: 0, // a missed warm-ping is harmless; don't retry/queue
        }),
      );
    }
  }
}
