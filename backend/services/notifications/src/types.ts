import { z } from 'zod';

/** PUT /notifications/prefs — per-user channel toggles. */
export const PrefsInput = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
  whatsapp: z.boolean(),
});
export type PrefsDto = z.infer<typeof PrefsInput>;
