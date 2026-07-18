// Admin directory of platform users + presence ("live/active") — role-gated.
// The predictor is public/unauthed, so this table holds only SIGNED-IN users; a scan
// is fine at that volume and this endpoint is called infrequently from the admin console.
import { requireRole } from '@sc/shared';
import type { Principal } from '@sc/shared';
import { usersRepo } from '../repo/users.repo';

const MINUTE = 60_000;
const LIVE_WINDOW_MS = 5 * MINUTE; // "live now" = active in the last 5 minutes
const DAY_MS = 24 * 60 * MINUTE; // "active today" / "new today" = last 24 hours
const SCAN_CAP = 5000; // bound the scan; `capped` flags when there are more
const PAGE = 200; // rows returned to the console (stats are computed over the whole scan)

export interface AdminUserView {
  userId: string;
  role: string;
  name?: string;
  email?: string;
  phone?: string;
  createdAt: string;
  lastSeenAt?: string;
  live: boolean;
  activeToday: boolean;
}

export interface AdminUsersResponse {
  users: AdminUserView[]; // most-recently-active first, capped to PAGE
  total: number; // users scanned
  liveNow: number;
  activeToday: number;
  newToday: number;
  byRole: Record<string, number>; // e.g. { student: 42, mentor: 6, admin: 1 }
  capped: boolean; // true when more than SCAN_CAP users exist (list is partial)
  generatedAt: string;
}

/** GET /admin/users — directory + live/active counts. Requires role=admin. */
export async function listUsers(p: Principal): Promise<AdminUsersResponse> {
  requireRole(p, 'admin');
  const now = Date.now();
  const { rows, capped } = await usersRepo.scanUsers(SCAN_CAP);

  const byRole: Record<string, number> = {};
  let liveNow = 0;
  let activeToday = 0;
  let newToday = 0;

  const decorated: AdminUserView[] = rows.map((u) => {
    const seen = u.lastSeenAt ? Date.parse(u.lastSeenAt) : 0;
    const created = u.createdAt ? Date.parse(u.createdAt) : 0;
    const live = seen > 0 && now - seen <= LIVE_WINDOW_MS;
    const activeTdy = seen > 0 && now - seen <= DAY_MS;
    byRole[u.role] = (byRole[u.role] ?? 0) + 1;
    if (live) liveNow++;
    if (activeTdy) activeToday++;
    if (created > 0 && now - created <= DAY_MS) newToday++;
    return { ...u, live, activeToday: activeTdy };
  });

  // Most-recently-active first (fall back to creation time), then trim to a page.
  decorated.sort((a, b) =>
    (Date.parse(b.lastSeenAt ?? b.createdAt) || 0) - (Date.parse(a.lastSeenAt ?? a.createdAt) || 0));

  return {
    users: decorated.slice(0, PAGE),
    total: decorated.length,
    liveNow,
    activeToday,
    newToday,
    byRole,
    capped,
    generatedAt: new Date(now).toISOString(),
  };
}
