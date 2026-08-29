'use client';
// ══════════════════════════════════════════════════════════════════════════
// Shared helpers for the mentor app (Phase 11): formatting, data hooks, the
// gate (application status → which screens unlock), an inline confirm modal.
// Imported by mentor.js + the mentor-*.js screen files. UX gating only — the
// API enforces every rule (static export ⇒ no server-side gating).
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn } from '@/components/ui';

// ── platform economics ──────────────────────────────────────────────────────
export const MENTOR_SHARE = 0.8;      // mentor keeps 80%; platform fee is 20%
export const SESSION_MIN = 25;
export const CONSENT_VERSION = '2026-08';

export const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export const initialsOf = (name = '') =>
  String(name).split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'M';
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—');
export const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Time TBD';
export const fmtFull = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export function fmtTime(t) {
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
export const CRIT = { background: '#f7e2db', color: '#7a2d1a' };
export const OK = { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' };
export const WARN = { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' };

// Session-status → chip colours.
export function statusStyle(status) {
  if (status === 'CONFIRMED' || status === 'LIVE' || status === 'ENDED' || status === 'RATED') return OK;
  if (status === 'REQUESTED' || status === 'ACCEPTED') return WARN;
  return CRIT;
}
export const isDone = (s) => s.status === 'ENDED' || s.status === 'RATED';
export const isUpcoming = (s) => s.status === 'ACCEPTED' || s.status === 'CONFIRMED' || s.status === 'LIVE';
export const isPaid = (s) => ['CONFIRMED', 'LIVE', 'ENDED', 'RATED'].includes(s.status);

// Loading / error / empty wrapper — mirrors the pattern used in admin.js.
export function Status({ loading, err, empty, emptyMsg = 'Nothing here yet.', onRetry, children }) {
  if (loading) return <p className="text-muted" style={{ fontSize: 13, margin: '6px 0' }}>Loading…</p>;
  if (err) return (
    <div className="card" style={{ background: '#f7e2db', color: '#7a2d1a', fontSize: 13 }}>
      ⚠ {err}{onRetry && <> — <button className="sc-btn ghost" style={{ padding: '0 6px', color: '#7a2d1a' }} onClick={onRetry}>retry</button></>}
    </div>
  );
  if (empty) return <p className="text-muted" style={{ fontSize: 13, margin: '6px 0' }}>{emptyMsg}</p>;
  return children;
}

// Fetch the caller's OWN application/profile (404 = not a mentor yet → null, not an error).
export function useMentorProfile() {
  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setMentor(await liveApi.mentorProfile()); }
    catch (e) { if (e.status === 404) setMentor(null); else setErr(e.message || 'Could not load your mentor profile'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { mentor, setMentor, loading, err, reload: load };
}

// The sessions where the caller is the MENTOR (not the ones they booked as a student).
export function useMyMentoringSessions() {
  const { sessions, profile } = useApp();
  return useMemo(() => {
    const uid = profile?.userId;
    const list = Array.isArray(sessions) ? sessions : [];
    return uid ? list.filter((s) => s.mentorId === uid) : list;
  }, [sessions, profile?.userId]);
}

// ── Gate: which parts of the mentor app are unlocked for this application status ──
// 'none' | DRAFT | PENDING_REVIEW | DOCS_VERIFIED | INTERVIEW_SCHEDULED → pre-approval (status +
// profile only); APPROVED → everything; SUSPENDED → everything read-only + banner.
export function useMentorGate() {
  const { mentorStatus } = useApp();
  const status = mentorStatus || 'none';
  const approved = status === 'APPROVED';
  const suspended = status === 'SUSPENDED';
  return { status, approved, suspended, unlocked: approved || suspended, readOnly: suspended };
}

export function SuspendedBanner() {
  const { suspended } = useMentorGate();
  if (!suspended) return null;
  return (
    <div className="card" style={{ ...CRIT, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 20 }}>⛔</span>
      <div style={{ flex: 1, fontSize: 13.5 }}>
        <strong>Your mentor profile is suspended.</strong> You are hidden from students and can&apos;t take new bookings. Everything here is read-only until an admin reinstates you.
      </div>
      <Btn variant="sec" go="help" style={{ color: '#7a2d1a' }}>Contact support</Btn>
    </div>
  );
}

// Shown on approved-only screens when the mentor isn't approved yet.
export function GateCard({ title = 'Finish your application first' }) {
  const { status } = useMentorGate();
  const msg = status === 'none' ? 'Apply and get verified to unlock this part of your mentor dashboard.'
    : status === 'DRAFT' ? 'Your application is still a draft — complete and submit it to get verified.'
    : status === 'REJECTED' ? 'This application was not approved, so the mentor tools stay locked.'
    : 'Your application is being verified. This unlocks the moment you are approved.';
  return (
    <div className="card" style={{ background: 'var(--color-accent-2-100)', marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{title}</div>
      <p style={{ fontSize: 13, margin: '4px 0 8px' }}>{msg}</p>
      <Btn variant="pri" go="mVerification" style={{ alignSelf: 'flex-start' }}>{status === 'none' ? 'Start your application →' : 'Open application status →'}</Btn>
    </div>
  );
}

// ── Inline confirm modal (component-local; never window.confirm) ─────────────
// usage: const confirm = useConfirm(); … confirm.ask({ title, body, confirmLabel, danger }, () => doIt())
//        … <confirm.Modal />
export function useConfirm() {
  const [pending, setPending] = useState(null);
  const ask = useCallback((opts, onConfirm) => setPending({ ...opts, onConfirm }), []);
  const close = useCallback(() => setPending(null), []);
  const Modal = useCallback(() => {
    if (!pending) return null;
    const run = async () => { const fn = pending.onConfirm; setPending(null); await fn?.(); };
    return (
      <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={close}>
        <div className="dialog" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 30 }}>{pending.icon || (pending.danger ? '⚠️' : '✅')}</div>
          <div className="dialog-title">{pending.title}</div>
          <div className="dialog-body">{pending.body}</div>
          {pending.notify && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 6 }}>🔔 Who gets notified: {pending.notify}</div>}
          <div className="dialog-actions">
            <Btn variant="sec" onClick={close}>{pending.cancelLabel || 'Go back'}</Btn>
            <Btn variant="pri" onClick={run} style={pending.danger ? { background: '#a8442e' } : undefined}>{pending.confirmLabel || 'Confirm'}</Btn>
          </div>
        </div>
      </div>
    );
  }, [pending, close]);
  return { ask, close, Modal };
}
