// Tracing + metrics baseline (Powertools). Import and use inside handlers/domain.
// Traces flow API GW -> Lambda -> DynamoDB (X-Ray). Metrics are EMF -> CloudWatch.
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';

export function createTracer(serviceName: string): Tracer {
  return new Tracer({ serviceName });
}

export function createMetrics(serviceName: string, namespace = 'StudentCounselor'): Metrics {
  return new Metrics({ serviceName, namespace });
}

export { Tracer, Metrics };
