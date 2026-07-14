// Request/response DTOs for auth-identity. Validated with zod in the handlers.
import { z } from 'zod';

// ── PATCH /me ──────────────────────────────────────────────────────────────
export const UpdateProfileInput = z.object({
  name: z.string().min(1).max(80).optional(),
  // TODO(owner): decide which fields are self-editable vs locked.
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

// ── PATCH /me/rank-prefs ───────────────────────────────────────────────────
export const RankPrefsInput = z.object({
  advRank: z.number().int().positive(),
  mainRank: z.number().int().positive(),
  category: z.enum(['Open', 'OBC-NCL', 'SC', 'ST', 'EWS']),
  home: z.string().min(2),
  gender: z.enum(['Male', 'Female']),
  pwd: z.boolean(),
  branches: z.array(z.string()).max(20),
  priority: z.enum(['branch', 'college']),
});
export type RankPrefsInput = z.infer<typeof RankPrefsInput>;

// ── POST /me/role ──────────────────────────────────────────────────────────
export const SwitchRoleInput = z.object({
  role: z.enum(['student', 'mentor']), // admin is granted out-of-band, never self-selected
});
export type SwitchRoleInput = z.infer<typeof SwitchRoleInput>;
