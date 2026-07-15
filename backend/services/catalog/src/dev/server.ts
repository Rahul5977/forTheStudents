// DEV-ONLY local server for the catalog service (public routes, no auth shim
// needed). Backed by DynamoDB Local. Start: pnpm --filter @sc/catalog dev
import { serve } from '@hono/node-server';
import { app } from '../app';
import { ensureCatalogTable } from './local-table';

const PORT = Number(process.env.PORT ?? 8788);

function withCors(res: Response, origin: string | null): Response {
  const out = new Response(res.body, res);
  out.headers.set('access-control-allow-origin', origin ?? '*');
  out.headers.set('access-control-allow-methods', 'GET,OPTIONS');
  out.headers.set('access-control-allow-headers', 'content-type');
  return out;
}

async function main() {
  await ensureCatalogTable();
  serve({
    port: PORT,
    fetch: async (req: Request) => {
      const origin = req.headers.get('origin');
      if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await app.fetch(req, { event: { requestContext: {} } } as any);
      return withCors(res, origin);
    },
  });
  // eslint-disable-next-line no-console
  console.log(`\n  catalog DEV server → http://localhost:${PORT}   (GET /predict, /colleges, /colleges/:id)\n`);
}

void main();
