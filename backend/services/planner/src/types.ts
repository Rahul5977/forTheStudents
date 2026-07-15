// Transport DTOs (zod) for the planner service. IDs are catalog cutoff ids.
import { z } from 'zod';

const id = z.number().int().nonnegative();
// A choice list can legitimately be long (JoSAA allows hundreds of choices),
// but cap it to keep a single item well under DynamoDB's 400 KB and avoid abuse.
const idList = z.array(id).max(500);

/** PUT /shortlist — replace the saved shortlist. `version` enables optimistic concurrency. */
export const PutShortlistInput = z.object({
  collegeIds: idList,
  version: z.number().int().nonnegative().optional(),
});

/** PUT /choice-list — replace the ordered choice list (order = JoSAA priority). */
export const PutChoiceListInput = z.object({
  items: idList,
  version: z.number().int().nonnegative().optional(),
});

/** POST /choice-list/reorder — move one row from `from` to `to` (0-based). */
export const ReorderInput = z.object({
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  version: z.number().int().nonnegative().optional(),
});

export type PutShortlist = z.infer<typeof PutShortlistInput>;
export type PutChoiceList = z.infer<typeof PutChoiceListInput>;
export type Reorder = z.infer<typeof ReorderInput>;
