// Structured logging via AWS Lambda Powertools. One logger per service.
// Correlation: request id is injected by the HTTP layer (see http.ts appendKeys).
import { Logger } from '@aws-lambda-powertools/logger';

/**
 * Create a service-scoped logger.
 * @param serviceName e.g. "auth-identity" — appears on every log line.
 */
export function createLogger(serviceName: string): Logger {
  // LOG_LEVEL is read from env by Powertools (INFO by default).
  return new Logger({ serviceName });
}

export { Logger };
