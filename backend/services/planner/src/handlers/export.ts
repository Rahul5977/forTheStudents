// POST /choice-list/export — render the ordered choice list to a PDF and return
// a signed download URL. Deferred: needs S3 + an async render worker (architecture
// §5.4). Boilerplate + shape only; the owner writes the render logic.
import type { Context } from 'hono';
import { getPrincipal, type AppEnv } from '@sc/shared';
import * as planner from '../domain/planner';

/**
 * POST /choice-list/export -> { url } (signed S3 URL)
 *
 * TODO(owner): implement PDF export.
 *   input:  the caller's saved choice list (already available via
 *           planner.getChoiceList(userId)) + optional rank query for buckets.
 *   steps:  1) decorate the list (reuse planner.doctor's decoration),
 *           2) render a PDF (e.g. @react-pdf/renderer or an HTML→PDF lambda layer),
 *           3) putObject to the exports S3 bucket under exports/<userId>/<ts>.pdf,
 *           4) return a getSignedUrl (GetObject, ~10 min TTL).
 *   infra:  add an S3 bucket (private, lifecycle-expire) + grant this fn put/get;
 *           heavy renders should go async (SQS + worker) and this returns a jobId.
 *   output: { url: string, expiresInSec: number }  (or { jobId } if async).
 */
export async function exportChoiceList(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  // Surface the data the exporter will format, so the endpoint is wired end-to-end
  // and the frontend can integrate against a stable shape before rendering exists.
  const list = await planner.getChoiceList(p.userId);
  return c.json(
    {
      status: 'not_implemented',
      message: 'PDF export is not available yet. For now, copy your choice list into josaa.nic.in in this order.',
      choiceCount: list.items.length,
      version: list.version,
    },
    501,
  );
}
