// ════════════════════════════════════════════════════════════════════════════
// DEV-ONLY local server for marketplace-mentors. Runs the real Hono app on your
// laptop against DynamoDB Local, faking the verified JWT (role settable so you can
// test the admin review flow). Never deploy this.
//
// Start:  pnpm dev:db
//         pnpm --filter @sc/marketplace dev
// Login:  POST /dev/login {email, role:"admin"} to get an admin token.
// ════════════════════════════════════════════════════════════════════════════
import { serve } from '@hono/node-server';
import { app } from '../app';
import type { LambdaBindings } from '@sc/shared';
import { ensureMentorsTable, ensureAuditTable } from './local-table';

const PORT = Number(process.env.PORT ?? 8790);
const b64url = {
  encode: (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url'),
  decode: (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8')),
};
const subFor = (email: string) => 'dev_' + email.toLowerCase().replace(/[^a-z0-9]+/g, '_');

function bindings(claims: Record<string, unknown>): LambdaBindings {
  return {
    event: { requestContext: { requestId: 'dev', authorizer: { jwt: { claims } } } },
    lambdaContext: {},
  } as unknown as LambdaBindings;
}
function cors(origin: string | null): Record<string, string> {
  return {
    'access-control-allow-origin': origin ?? '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
  };
}

async function fetchHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  const ch = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });

  // Public browse needs no token.
  if (url.pathname === '/mentors' || url.pathname === '/health') {
    const res = await app.fetch(req, bindings({}) as never);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(ch)) out.headers.set(k, v);
    return out;
  }

  if (url.pathname === '/dev/login' && req.method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; role?: string; scopes?: string[] };
    if (!body.email) return Response.json({ error: 'email required' }, { status: 400, headers: ch });
    const claims: Record<string, unknown> = { sub: subFor(body.email), email: body.email, email_verified: true, 'custom:role': body.role ?? 'student' };
    // Phase 11: admin permission scopes ride in the token as `custom:scopes` (comma-separated).
    if (Array.isArray((body as { scopes?: string[] }).scopes)) claims['custom:scopes'] = ((body as { scopes?: string[] }).scopes ?? []).join(',');
    if (body.name) claims.name = body.name;
    return Response.json({ token: 'dev.' + b64url.encode(claims), claims }, { headers: ch });
  }

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token.startsWith('dev.')) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Missing dev token' } }, { status: 401, headers: ch });
  }
  let claims: Record<string, unknown>;
  try {
    claims = b64url.decode(token.slice(4));
  } catch {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Bad dev token' } }, { status: 401, headers: ch });
  }

  const res = await app.fetch(req, bindings(claims) as never);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(ch)) out.headers.set(k, v);
  return out;
}

async function main() {
  await ensureMentorsTable();
  await ensureAuditTable();
  serve({ fetch: fetchHandler, port: PORT });
  // eslint-disable-next-line no-console
  console.log(`\n  marketplace DEV server  →  http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log('  Flow: apply → verify/email (devOtp) → documents/presign+confirm → submit → admin fields/verify-docs/interview/review → GET /mentors\n');
}

void main();
