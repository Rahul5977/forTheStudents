// DEV-ONLY local server for notifications. Feed API + a `/dev/emit` helper to
// simulate a domain event (stands in for EventBridge→SQS→consumer). Never deploy.
//   pnpm dev:db ; pnpm --filter @sc/notifications dev
import { serve } from '@hono/node-server';
import { app } from '../app';
import type { LambdaBindings } from '@sc/shared';
import { ingest } from '../domain/notifications';
import { ensureNotificationsTable } from './local-table';

const PORT = Number(process.env.PORT ?? 8792);
const b64url = {
  encode: (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url'),
  decode: (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8')),
};
const subFor = (email: string) => 'dev_' + email.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const bindings = (claims: Record<string, unknown>): LambdaBindings =>
  ({ event: { requestContext: { requestId: 'dev', authorizer: { jwt: { claims } } } }, lambdaContext: {} }) as unknown as LambdaBindings;
const cors = (o: string | null): Record<string, string> => ({
  'access-control-allow-origin': o ?? '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
});

async function fetchHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ch = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });

  // Simulate a domain event landing on the consumer.
  if (url.pathname === '/dev/emit' && req.method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as { type?: string; detail?: Record<string, unknown> };
    const n = await ingest(body.type ?? '', body.detail ?? {});
    return Response.json({ ingested: n }, { headers: ch });
  }
  if (url.pathname === '/dev/login' && req.method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    if (!body.email) return Response.json({ error: 'email required' }, { status: 400, headers: ch });
    return Response.json({ token: 'dev.' + b64url.encode({ sub: subFor(body.email), email: body.email, email_verified: true, 'custom:role': 'student' }) }, { headers: ch });
  }

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token.startsWith('dev.')) return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Missing dev token' } }, { status: 401, headers: ch });
  let claims: Record<string, unknown>;
  try { claims = b64url.decode(token.slice(4)); } catch { return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401, headers: ch }); }
  const res = await app.fetch(req, bindings(claims) as never);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(ch)) out.headers.set(k, v);
  return out;
}

async function main() {
  await ensureNotificationsTable();
  serve({ fetch: fetchHandler, port: PORT });
  // eslint-disable-next-line no-console
  console.log(`\n  notifications DEV server → http://localhost:${PORT}  (POST /dev/emit, GET /notifications)\n`);
}
void main();
