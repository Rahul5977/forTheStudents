// Choice-list endpoints (ordered) + List Doctor. Per-user, behind the authorizer.
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { PutChoiceListInput, ReorderInput } from '../types';
import * as planner from '../domain/planner';

/** GET /choice-list -> { items, version } */
export async function getChoiceList(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(await planner.getChoiceList(p.userId));
}

/** PUT /choice-list { items, version? } -> { items, version } */
export async function putChoiceList(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = PutChoiceListInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid choice list', parsed.error.flatten());
  return c.json(await planner.putChoiceList(p.userId, parsed.data));
}

/** POST /choice-list/reorder { from, to, version? } -> { items, version } */
export async function reorder(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = ReorderInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw ValidationError('Invalid reorder', parsed.error.flatten());
  return c.json(await planner.reorder(p.userId, parsed.data));
}

/** GET /choice-list/doctor?advRank&mainRank&category&home&gender -> report */
export async function doctor(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(await planner.doctor(p.userId, c.req.query()));
}
