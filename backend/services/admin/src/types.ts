// Transport DTOs (zod) for the admin-ops service. Every route is role=admin.
import { z } from 'zod';

/** POST /admin/mentors/:id/suspend — optional moderation reason (audited). */
export const SuspendInput = z.object({
  reason: z.string().max(300).optional(),
});

/** POST /admin/broadcast — publish one 'admin.broadcast' event → per-user notif fanout. */
export const BroadcastInput = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(2).max(600),
  userIds: z.array(z.string().min(1).max(120)).min(1).max(500),
});

export type Suspend = z.infer<typeof SuspendInput>;
export type Broadcast = z.infer<typeof BroadcastInput>;
