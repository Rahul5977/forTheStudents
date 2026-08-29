// Business logic for admin-ops (Phase 7). EVERY action requires role=admin; mutating actions
// additionally require the matching permission SCOPE (Phase 11 packet 2 — requireScope) and are
// recorded to the append-only audit trail. stats/audit are readable by any admin (no scope). Metrics are CHEAP by design — status COUNTs
// off the mentors GSI + the caller's own audit count — never a live table scan.
import { NotFoundError, requireRole, requireScope, publish, assertTransition, type Principal } from '@sc/shared';
import { mentorsModRepo } from '../repo/mentors.repo';
import { auditRepo } from '../repo/audit.repo';
import type { Suspend, Broadcast } from '../types';

// ── Platform metrics ──────────────────────────────────────────────────────────
/**
 * GET /admin/stats — cheap counters only. Mentor counts come from the sparse
 * `gsi1-status` index (Query + COUNT); audit count is the caller's own trail.
 * Booking/revenue rollups are materialized by Phase 8 DynamoDB Streams aggregates
 * and read from pre-computed rows — we NEVER scan the bookings/ledger tables here.
 */
export async function stats(p: Principal) {
  requireRole(p, 'admin');
  const [pendingReview, approved, auditEntries] = await Promise.all([
    mentorsModRepo.countByStatus('PENDING_REVIEW'),
    mentorsModRepo.countByStatus('APPROVED'),
    auditRepo.count(p.userId),
  ]);
  return {
    mentors: { pendingReview, approved },
    audit: { entries: auditEntries },
    // TODO(Phase 8): fold booking/revenue counters from Streams aggregates (never scan).
    rollups: { note: 'booking & revenue rollups are fed by Phase 8 stream aggregates' },
  };
}

// ── Audit trail ─────────────────────────────────────────────────────────────────
/** GET /admin/audit?limit= — the caller's recent actions, newest-first. */
export async function audit(p: Principal, limit: number) {
  requireRole(p, 'admin');
  const entries = await auditRepo.recent(p.userId, limit);
  return { count: entries.length, entries };
}

// ── Moderation ────────────────────────────────────────────────────────────────
/** POST /admin/mentors/:id/suspend — drop an approved mentor from public search. */
export async function suspend(p: Principal, targetUserId: string, input: Suspend) {
  requireScope(p, 'mentors.manage');
  const existing = await mentorsModRepo.get(targetUserId);
  if (!existing) throw NotFoundError('Mentor not found.');
  assertTransition(existing.status, 'SUSPENDED'); // APPROVED only (shared machine) → 409 otherwise
  const mentor = await mentorsModRepo.transition(targetUserId, 'APPROVED', 'SUSPENDED', p.userId, input.reason);
  await auditRepo.append(p.userId, 'mentor.suspend', { target: targetUserId, detail: { reason: input.reason } });
  await publish({ type: 'mentor.suspended', source: 'admin', detail: { userId: targetUserId, reason: input.reason } });
  return mentor;
}

/** POST /admin/mentors/:id/reinstate — restore a suspended mentor to public search. */
export async function reinstate(p: Principal, targetUserId: string) {
  requireScope(p, 'mentors.manage');
  const existing = await mentorsModRepo.get(targetUserId);
  if (!existing) throw NotFoundError('Mentor not found.');
  assertTransition(existing.status, 'APPROVED'); // SUSPENDED only
  if (existing.status !== 'SUSPENDED') throw NotFoundError('Mentor is not suspended.');
  const mentor = await mentorsModRepo.transition(targetUserId, 'SUSPENDED', 'APPROVED', p.userId);
  await auditRepo.append(p.userId, 'mentor.reinstate', { target: targetUserId });
  await publish({ type: 'mentor.reinstated', source: 'admin', detail: { userId: targetUserId } });
  return mentor;
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
/**
 * POST /admin/broadcast — emit one 'admin.broadcast' domain event. The notifications
 * consumer fans it out to one in-app notification per userId (see notifications fanout).
 * We never write notifications directly — that keeps admin-ops decoupled and channel-agnostic.
 */
export async function broadcast(p: Principal, input: Broadcast) {
  requireScope(p, 'broadcast.send');
  await publish({
    type: 'admin.broadcast',
    source: 'admin',
    detail: { title: input.title, body: input.body, userIds: input.userIds },
  });
  await auditRepo.append(p.userId, 'admin.broadcast', { detail: { title: input.title, recipients: input.userIds.length } });
  return { ok: true, recipients: input.userIds.length };
}
