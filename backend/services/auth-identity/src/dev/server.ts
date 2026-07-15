// ════════════════════════════════════════════════════════════════════════════
// DEV-ONLY local server. Runs the SAME Hono app the Lambda runs, but on your
// laptop, backed by DynamoDB Local. It fakes the ONE thing the cloud gives us for
// free: a verified JWT. This lets the real frontend do login -> token -> /me
// against a real database with zero AWS.
//
// Start it:  pnpm dev:db            (once — DynamoDB Local)
//            pnpm --filter @sc/auth-identity dev
//
// !!! Never deploy this. In AWS, API Gateway + Cognito verify real JWTs. !!!
// ════════════════════════════════════════════════════════════════════════════
import { serve } from '@hono/node-server';
import { app } from '../app';
import type { LambdaBindings } from '@sc/shared';
import { ensureUsersTable } from './local-table';

const PORT = Number(process.env.PORT ?? 8787);
const b64url = {
  encode: (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url'),
  decode: (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8')),
};

/** A deterministic fake `sub` so the same email is always the same user row. */
const subFor = (email: string) => 'dev_' + email.toLowerCase().replace(/[^a-z0-9]+/g, '_');

/** Build the Lambda-shaped bindings the app expects, from decoded dev claims. */
function bindings(claims: Record<string, unknown>): LambdaBindings {
  return {
    event: { requestContext: { requestId: 'dev', authorizer: { jwt: { claims } } } },
    lambdaContext: {},
  } as unknown as LambdaBindings;
}

function cors(origin: string | null): Record<string, string> {
  return {
    'access-control-allow-origin': origin ?? '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
  };
}

async function fetchHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  const ch = cors(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });

  // Public health check (no token needed).
  if (url.pathname === '/health') {
    const res = await app.fetch(req, bindings({}) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(ch)) out.headers.set(k, v);
    return out;
  }

  // ── Fake login: email -> dev token (base64url of the claims Cognito would mint) ──
  if (url.pathname === '/dev/login' && req.method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; role?: string };
    if (!body.email) return Response.json({ error: 'email required' }, { status: 400, headers: ch });
    const claims: Record<string, unknown> = {
      sub: subFor(body.email),
      email: body.email,
      'custom:role': body.role ?? 'student',
    };
    if (body.name) claims.name = body.name;
    const token = 'dev.' + b64url.encode(claims);
    return Response.json({ token, claims }, { headers: ch });
  }

  // ── Everything else needs a dev bearer token; decode it into claims ──
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

  // Hand off to the real app with the faked, "verified" claims (env = Bindings).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await app.fetch(req, bindings(claims) as any);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(ch)) out.headers.set(k, v);
  return out;
}

async function main() {
  await ensureUsersTable();
  serve({ fetch: fetchHandler, port: PORT });
  // eslint-disable-next-line no-console
  console.log(`\n  auth-identity DEV server  →  http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log('  DynamoDB Local            →  ' + (process.env.DDB_ENDPOINT ?? 'http://localhost:8000'));
  // eslint-disable-next-line no-console
  console.log('  Try: POST /dev/login {email} -> token, then GET /me with Bearer token\n');
}

void main();
