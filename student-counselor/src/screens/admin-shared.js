'use client';
// ══════════════════════════════════════════════════════════════════════════
// Shared helpers for the admin console (Phase 11): status metadata, field labels,
// formatting, the inline confirm dialog (never window.confirm/prompt), the
// paginated-queue hook, and the Status / Note panels used by every admin screen.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from 'react';
import { liveApi } from '@/lib/liveApi';
import { Btn } from '@/components/ui';

export const CRIT = { background: '#f7e2db', color: '#7a2d1a' };
const OK = { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' };
const WARM = { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' };
const NEUTRAL = { background: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)' };

// Every mentor status the backend knows, in pipeline order (ADR-012).
export const STATUS_META = {
  DRAFT: { label: 'Draft', short: 'Draft', style: NEUTRAL, hint: 'Not submitted yet (or sent back for changes).' },
  PENDING_REVIEW: { label: 'Pending review', short: 'Pending', style: WARM, hint: 'Submitted — every detail awaits manual verification.' },
  DOCS_VERIFIED: { label: 'Docs verified', short: 'Verified', style: OK, hint: 'Every detail checked — ready to schedule the interview.' },
  INTERVIEW_SCHEDULED: { label: 'Interview scheduled', short: 'Interview', style: WARM, hint: 'Screening interview booked — decide after it.' },
  APPROVED: { label: 'Approved', short: 'Approved', style: OK, hint: 'Live on the marketplace.' },
  SUSPENDED: { label: 'Suspended', short: 'Suspended', style: CRIT, hint: 'Hidden from students by moderation.' },
  REJECTED: { label: 'Rejected', short: 'Rejected', style: CRIT, hint: 'Declined — terminal.' },
};
export const QUEUE_STATUSES = ['PENDING_REVIEW', 'DOCS_VERIFIED', 'INTERVIEW_SCHEDULED'];
export const ALL_STATUSES = Object.keys(STATUS_META);

export function StatusTag({ status, style = {} }) {
  const m = STATUS_META[status] || { label: status || '—', style: NEUTRAL };
  return <span className="tag" style={{ ...m.style, ...style }} title={m.hint}>{m.label}</span>;
}

// Per-field verification — keys are the backend's URL-safe field ids.
export const FIELD_LABELS = {
  name: 'Full name', college: 'College', branch: 'Branch', year: 'Current year', gradYear: 'Graduation year',
  rollNumber: 'Roll number', collegeEmail: 'College email (.ac.in)', phone: 'Phone', jeeRank: 'Own JEE rank & year',
  essayWhy: 'Essay · Why become a mentor?', essayHow: 'Essay · How will you help during JoSAA?', doc_id_card: 'College ID card',
  essayOther: 'Essay · Anything else', doc_supporting: 'Supporting document',
};
export const REQUIRED_FIELDS = ['name', 'college', 'branch', 'year', 'gradYear', 'rollNumber', 'collegeEmail', 'phone', 'jeeRank', 'essayWhy', 'essayHow', 'doc_id_card'];
export const OPTIONAL_FIELDS = ['essayOther', 'doc_supporting'];

/** The submitted value for a verification field (documents/essays are rendered elsewhere). */
export function fieldValue(app, key) {
  if (!app) return '—';
  switch (key) {
    case 'year': return app.year != null ? `Year ${app.year}` : '—';
    case 'collegeEmail': return app.email ? `${app.email}${app.emailVerified ? ' · OTP ✓' : ' · not verified'}` : '—';
    case 'jeeRank': return app.jeeRank ? `AIR ${num(app.jeeRank)}${app.jeeYear ? ` (${app.jeeYear})` : ''}` : '—';
    case 'essayWhy': return app.essays?.why || '—';
    case 'essayHow': return app.essays?.how || '—';
    case 'essayOther': return app.essays?.other || '—';
    case 'doc_id_card': return app.documents?.id_card ? `${app.documents.id_card.contentType} · ${kb(app.documents.id_card.sizeBytes)}` : 'not uploaded';
    case 'doc_supporting': return app.documents?.supporting ? `${app.documents.supporting.contentType} · ${kb(app.documents.supporting.sizeBytes)}` : 'not uploaded';
    default: return app[key] != null && app[key] !== '' ? String(app[key]) : '—';
  }
}

// ── formatting ───────────────────────────────────────────────────────────────
export const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));
export const kb = (b) => (b == null ? '—' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
export const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export function agoOf(iso) {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
/** "2d 4h" waiting-time label. */
export function waitOf(iso) {
  if (!iso) return '—';
  const ms = Math.max(0, Date.now() - Date.parse(iso));
  return durationLabel(ms);
}
export function durationLabel(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
  return `${Math.max(1, Math.floor(ms / 60000))}m`;
}
/** <input type="datetime-local"> value ↔ ISO. */
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; };

/** Human error: a 403 means the caller lacks the scope the route is gated on. */
export function errMsg(e, scope) {
  if (e?.status === 403) return `You don't have the ${scope || 'required'} permission.`;
  return e?.message || 'Something went wrong';
}

// ── panels ───────────────────────────────────────────────────────────────────
export function Note({ tone = 'neutral', children, style = {} }) {
  const bg = tone === 'warn' ? '#f7e2db' : tone === 'ok' ? 'var(--color-accent-2-100)' : 'var(--color-neutral-100)';
  const fg = tone === 'warn' ? '#7a2d1a' : tone === 'ok' ? 'var(--color-accent-2-800)' : 'var(--color-neutral-700)';
  return (
    <div style={{ background: bg, color: fg, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, ...style }}>
      {children}
    </div>
  );
}

// Standard loading / error / empty rendering for a data panel.
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

/** Segmented status tabs with counts. */
export function StatusTabs({ statuses, value, counts, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {statuses.map((s) => {
        const on = s === value;
        return (
          <span key={s} className={on ? 'tag tag-accent' : 'tag tag-neutral'} onClick={() => onChange(s)} style={{ cursor: 'pointer', fontSize: 12.5 }} title={STATUS_META[s]?.hint}>
            {STATUS_META[s]?.label || s}{counts && counts[s] != null ? <strong style={{ marginLeft: 6 }}>{num(counts[s])}</strong> : null}
          </span>
        );
      })}
    </div>
  );
}

// ── confirm dialog (inline; every state-changing action goes through it) ─────
export function ConfirmDialog({ icon = '⚠️', title, body, notify, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, busy = false, error, onConfirm, onCancel, children }) {
  return (
    <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={busy ? undefined : onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div style={{ fontSize: 32 }}>{icon}</div>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">
          {body && <div>{body}</div>}
          {children}
          {notify && <div style={{ marginTop: 10, fontSize: 12.5, background: 'var(--color-neutral-100)', borderRadius: 10, padding: '8px 10px' }}>🔔 <strong>Who gets notified:</strong> {notify}</div>}
          {error && <div style={{ marginTop: 10, fontSize: 12.5, ...CRIT, borderRadius: 10, padding: '8px 10px' }}>⚠ {error}</div>}
        </div>
        <div className="dialog-actions">
          <Btn variant="sec" onClick={onCancel} disabled={busy}>{cancelLabel}</Btn>
          <Btn variant="pri" onClick={onConfirm} disabled={busy} style={danger ? { background: '#a8442e' } : undefined}>{busy ? 'Working…' : confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

/**
 * useConfirm() → { ask, confirmEl }. `ask({ title, body, notify, confirmLabel, danger, icon, scope, run })`
 * shows the dialog; `run()` executes on confirm, the dialog closes on success and shows the
 * error inline on failure (403 → "You don't have the <scope> permission").
 */
export function useConfirm() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ask = useCallback((c) => { setError(null); setCfg(c); }, []);
  const close = useCallback(() => { if (!busy) { setCfg(null); setError(null); } }, [busy]);
  const confirm = useCallback(async () => {
    if (!cfg) return;
    setBusy(true); setError(null);
    try { await cfg.run(); setCfg(null); }
    catch (e) { setError(errMsg(e, cfg.scope)); }
    finally { setBusy(false); }
  }, [cfg]);
  const confirmEl = cfg ? (
    <ConfirmDialog icon={cfg.icon} title={cfg.title} body={cfg.body} notify={cfg.notify} confirmLabel={cfg.confirmLabel} danger={cfg.danger} busy={busy} error={error} onConfirm={confirm} onCancel={close}>
      {cfg.children}
    </ConfirmDialog>
  ) : null;
  return { ask, confirmEl };
}

// ── paginated status queue ───────────────────────────────────────────────────
/** One backend status partition, oldest-first, with a real cursor + a text filter. */
export function useQueue(status, q = '', limit = 25) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState(null);
  const [cursor, setCursor] = useState(null);
  const seq = useRef(0);

  const fetchPage = useCallback(async (reset) => {
    const my = ++seq.current;
    if (reset) setLoading(true); else setMore(true);
    setErr(null);
    try {
      const r = await liveApi.adminMentorQueue({ status, limit, ...(q ? { q } : {}), ...(!reset && cursor ? { cursor } : {}) });
      if (my !== seq.current) return;
      setItems((cur) => (reset ? r.items || [] : [...cur, ...(r.items || [])]));
      setCursor(r.nextCursor || null);
    } catch (e) { if (my === seq.current) setErr(errMsg(e, 'mentors.manage')); }
    finally { if (my === seq.current) { setLoading(false); setMore(false); } }
  }, [status, q, limit, cursor]);

  const reload = useCallback(() => { setCursor(null); return fetchPage(true); }, [fetchPage]);
  useEffect(() => { setCursor(null); fetchPage(true); }, [status, q]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Replace one item in place (after a detail action) without refetching. */
  const patch = useCallback((app) => setItems((cur) => cur.map((it) => (it.userId === app.userId ? app : it))), []);
  const remove = useCallback((userId) => setItems((cur) => cur.filter((it) => it.userId !== userId)), []);

  return { items, loading, err, more, hasMore: !!cursor, loadMore: () => fetchPage(false), reload, patch, remove };
}

/** Per-status counts (cheap COUNT queries). */
export function useCounts() {
  const [counts, setCounts] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try { setCounts(await liveApi.adminMentorCounts()); setErr(null); }
    catch (e) { setErr(errMsg(e, 'mentors.manage')); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { counts, err, reload: load };
}

/**
 * Approximate time spent per stage, from the `history` of the loaded applications: each
 * history entry opens a stage that closes at the next entry (or now). Returns ms averages.
 */
export function stageAverages(apps) {
  const sums = {}; const n = {};
  for (const a of apps || []) {
    const h = Array.isArray(a.history) ? a.history : [];
    for (let i = 0; i < h.length; i++) {
      const start = Date.parse(h[i].at);
      const end = i + 1 < h.length ? Date.parse(h[i + 1].at) : Date.now();
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      const stage = h[i].to;
      sums[stage] = (sums[stage] || 0) + Math.max(0, end - start);
      n[stage] = (n[stage] || 0) + 1;
    }
  }
  const out = {};
  for (const k of Object.keys(sums)) out[k] = sums[k] / n[k];
  return out;
}
