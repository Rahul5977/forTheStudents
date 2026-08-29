'use client';
// ══════════════════════════════════════════════════════════════════════════
// Audit log (Phase 11 packet 7) — the append-only admin trail, read-only by design.
// The API serves the SIGNED-IN admin's own partition (PK=ADMIN#<adminId>), so the
// actor filter is informational; action / target / date filters are client-side.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn, Input, Field, Select } from '@/components/ui';
import { fmtWhen, errMsg, Note, Status } from './admin-shared';

const ACTION_LABELS = {
  'mentor.field.verify': 'Field verified / flagged', 'mentor.docs.verified': 'Documents verified', 'mentor.document.access': 'ID document viewed',
  'mentor.interview.schedule': 'Interview scheduled', 'mentor.interview.reschedule': 'Interview rescheduled', 'mentor.interview.cancel': 'Interview cancelled',
  'mentor.review.approve': 'Mentor approved', 'mentor.review.reject': 'Mentor rejected / sent back', 'mentor.suspend': 'Mentor suspended', 'mentor.reinstate': 'Mentor reinstated',
  'admin.broadcast': 'Broadcast sent', 'admin.promote': 'Admin promoted', 'admin.scopes': 'Admin scopes changed', 'admin.demote': 'Admin demoted', 'superadmin.bootstrap': 'Superadmin bootstrapped',
};
const toneOf = (action = '') => (/reject|suspend|demote|document\.access/.test(action) ? { background: '#f7e2db', color: '#7a2d1a' } : /approve|verified|reinstate|promote/.test(action) ? { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' } : undefined);

export function AAudit() {
  const { profile } = useApp();
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const r = await liveApi.adminAudit({ limit: 200 }); setEntries(r?.entries ?? []); }
    catch (e) { setErr(errMsg(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const actions = useMemo(() => [...new Set((entries || []).map((e) => e.action))].sort(), [entries]);
  const shown = useMemo(() => (entries || []).filter((e) => {
    if (action && e.action !== action) return false;
    if (target && !String(e.target || '').toLowerCase().includes(target.trim().toLowerCase())) return false;
    if (actor && !String(e.adminId || '').toLowerCase().includes(actor.trim().toLowerCase())) return false;
    if (from && Date.parse(e.at) < Date.parse(from)) return false;
    if (to && Date.parse(e.at) > Date.parse(to) + 86_400_000) return false;
    return true;
  }), [entries, action, target, actor, from, to]);

  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h1 style={{ margin: 0, fontSize: 26 }}>Audit log</h1><span className="tag tag-neutral">🔒 read-only</span><Btn variant="ghost" onClick={load}>↻ Refresh</Btn></div>
      <p className="text-muted" style={{ fontSize: 14 }}>Append-only: nothing here can be edited or deleted — by anyone, including the superadmin. Every admin action (verification, document views, interviews, decisions, moderation, broadcasts, team changes) lands here.</p>
      <Note style={{ marginBottom: 12 }}>This view shows <strong>your own</strong> actions ({profile?.email || profile?.userId || 'signed-in admin'}) — the trail is partitioned per admin and the API serves the caller&apos;s partition. Latest 200 entries; filters apply to what is loaded.</Note>

      <div className="card" style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <Field label="Action" style={{ minWidth: 200 }}><Select value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{actions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}</Select></Field>
        <Field label="Target (mentor / user id)" style={{ minWidth: 180 }}><Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="userId…" /></Field>
        <Field label="Actor (admin id)" style={{ minWidth: 160 }}><Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="admin id…" /></Field>
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {(action || target || actor || from || to) && <Btn variant="ghost" onClick={() => { setAction(''); setTarget(''); setActor(''); setFrom(''); setTo(''); }}>Clear</Btn>}
      </div>

      <Status loading={loading && !entries} err={err} empty={!!entries && shown.length === 0} emptyMsg={entries?.length ? 'No entries match those filters.' : 'No admin actions recorded yet.'} onRetry={load}>
        <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 720 }}>
            <thead><tr><th>When</th><th>Action</th><th>Target</th><th>Detail</th><th>Actor</th></tr></thead>
            <tbody>
              {shown.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{fmtWhen(e.at)}</td>
                  <td><span className="tag" style={toneOf(e.action) || { background: 'var(--color-neutral-100)' }}>{ACTION_LABELS[e.action] || e.action}</span><div className="text-muted" style={{ fontSize: 11 }}>{e.action}</div></td>
                  <td style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{e.target || <span className="text-muted">—</span>}</td>
                  <td style={{ fontSize: 12.5 }}>{e.detail && Object.keys(e.detail).length ? Object.entries(e.detail).map(([k, v]) => <div key={k}><span className="text-muted">{k}:</span> {Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v ? JSON.stringify(v) : String(v)}</div>) : <span className="text-muted">—</span>}</td>
                  <td style={{ fontSize: 12, wordBreak: 'break-all' }}>{e.adminId === profile?.userId ? 'you' : e.adminId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>{shown.length} of {entries?.length ?? 0} loaded entries shown.</div>
      </Status>
    </section>
  );
}
