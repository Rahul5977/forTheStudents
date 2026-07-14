// Hono app factory shared by every service lambdalith.
// Provides: request-id, error mapping (AppError -> JSON), 404, and a health route.
import { Hono } from 'hono';
import { ulid } from 'ulid';
import { toErrorBody } from './errors';
import { createLogger } from './logger';
import type { LambdaBindings } from './auth';

export type AppEnv = { Bindings: LambdaBindings; Variables: { requestId: string } };

/**
 * Build a base Hono app with cross-cutting middleware wired.
 * @param serviceName used for logging.
 */
export function createApp(serviceName: string): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const logger = createLogger(serviceName);

  // Attach a request id and log start/finish.
  app.use('*', async (c, next) => {
    const requestId =
      c.req.header('x-request-id') ?? c.env?.event?.requestContext?.requestId ?? ulid();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    logger.appendKeys({ requestId });
    const start = Date.now();
    await next();
    logger.info('request', { method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start });
  });

  app.get('/health', (c) => c.json({ ok: true, service: serviceName }));

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));

  app.onError((err, c) => {
    const { statusCode, body } = toErrorBody(err);
    if (statusCode >= 500) logger.error('unhandled', err as Error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json(body, statusCode as any);
  });

  return app;
}
