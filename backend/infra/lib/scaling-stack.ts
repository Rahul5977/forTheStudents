// Phase 9: seasonal provisioned-concurrency scaling for the hot Lambdas.
//
// COST LEVER — READ THIS. Provisioned concurrency is the single biggest cost knob in
// the whole platform: you pay ~$0.0000041667 per GB-second of *provisioned* capacity
// 24/7 whether or not a request arrives (a 256 MB fn held at PC=20 ≈ 0.25 GB × 20 ×
// 730 h ≈ ~$15/mo per function, plus the usual per-invoke charge on top). So this
// ENTIRE stack is a NO-OP unless `cfg.provisionedConcurrency > 0`.
//   • Default in every stage (dev/staging/prod) = 0 → this stack creates ZERO
//     resources → ZERO idle cost. `bin/app.ts` doesn't even instantiate it at 0.
//   • Turn it ON only for the Jun–Jul JoSAA peak (set cfg.provisionedConcurrency>0 in
//     the prod config), and the schedules below ramp it back to 0 on ~Aug 1 so you
//     stop paying the moment the season ends. OFF by default, season-gated.
//
// It wires Application Auto Scaling *scheduled* actions onto the hot functions'
// provisioned-concurrency dimension: scale UP ~Jun 1, scale DOWN (to zero) ~Aug 1.
// Self-contained — it only needs `cfg`; it references the deployed functions by name.
import { Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import type { StageConfig } from './config';

export interface ScalingStackProps extends StackProps {
  cfg: StageConfig;
}

// The alias each hot service publishes off $LATEST. Provisioned concurrency + App
// Auto Scaling bind to a Lambda ALIAS/version, never to $LATEST.
// TODO(owner): when you set cfg.provisionedConcurrency>0, publish a `live` alias on
// each hot function in its service stack (e.g. `fn.addAlias('live')`) and route the
// API integration at that alias. Until an alias named `live` exists these scheduled
// actions have nothing to bind to. Kept out of the service stacks so off-season those
// stacks stay alias-free (an alias with PC set would itself be a standing cost).
const ALIAS = 'live';

export class ScalingStack extends Stack {
  constructor(scope: Construct, id: string, props: ScalingStackProps) {
    super(scope, id, props);
    const { cfg } = props;

    // Hard guard: at 0 (the default) create NOTHING → no scalable targets, no
    // scheduled actions, no service-linked role, no cost. `bin/app.ts` also skips
    // instantiating this stack at 0, so this is defence-in-depth.
    if (cfg.provisionedConcurrency <= 0) return;

    const floor = cfg.provisionedConcurrency;

    // Hot paths only: the PUBLIC predictor (`sc-<stage>-catalog`, the round-result
    // spike) and `sc-<stage>-auth-identity` (login storm). Everything else scales
    // from zero on demand — cold starts there are acceptable and free.
    const hotFns = [`sc-${cfg.stage}-catalog`, `sc-${cfg.stage}-auth-identity`];

    for (const fnName of hotFns) {
      // Reference the already-deployed function by name (read-only import — this stack
      // does not own or mutate it; it just documents the dependency).
      const fn = lambda.Function.fromFunctionName(this, `${fnName}-ref`, fnName);
      void fn; // imported for clarity; scaling binds to the alias resource id below.

      const target = new appscaling.ScalableTarget(this, `${fnName}-pc`, {
        serviceNamespace: appscaling.ServiceNamespace.LAMBDA,
        // Provisioned concurrency scales the ALIAS: function:<name>:<alias>.
        resourceId: `function:${fnName}:${ALIAS}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
        minCapacity: 0, // off-season floor = 0 → no idle bill outside the schedule
        maxCapacity: floor, // peak floor comes straight from cfg.provisionedConcurrency
      });

      // Season ON — ~Jun 1 00:00 UTC: warm the fleet before JoSAA rounds open.
      // TODO(owner): pin these to the real JoSAA round-1 publish dates each season.
      target.scaleOnSchedule(`${fnName}-season-up`, {
        schedule: appscaling.Schedule.cron({ minute: '0', hour: '0', day: '1', month: '6' }),
        minCapacity: floor,
        maxCapacity: floor,
      });

      // Season OFF — ~Aug 1 00:00 UTC: scale provisioned concurrency back to ZERO.
      // THIS is the line that keeps the annual bill near-$0 — the fleet is only paid
      // for the ~2 peak months, not the other 10.
      target.scaleOnSchedule(`${fnName}-season-down`, {
        schedule: appscaling.Schedule.cron({ minute: '0', hour: '0', day: '1', month: '8' }),
        minCapacity: 0,
        maxCapacity: 0,
      });
    }
  }
}
