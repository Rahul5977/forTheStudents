'use client';
// ══════════════════════════════════════════════════════════════════════════
// Mentor directory (every status, suspend / reinstate, status history) and the
// Interview calendar (Phase 11 packet 7). Both read the cursor-paged status queue.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn, Input, Field, Select } from '@/components/ui';
import {
  ALL_STATUSES, STATUS_META, StatusTag, StatusTabs, fmtWhen, waitOf, toLocalInput, fromLocalInput, errMsg,
  Note, Status, useConfirm, useQueue, useCounts,
} from './admin-shared';
import { ApplicationDetail } from './admin-verify';

// ── Mentor directory ──────────────────────────────────────────────────────────
export function AMentors() {
  const { showToast } = useApp();
  const [status, setStatus] = useState('APPROVED');
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [openId, setOpenId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const reasonRef = useRef('');
  const queue = useQueue(status, qApplied);
  const { counts, reload: reloadCounts } = useCounts();
  const { ask, confirmEl } = useConfirm();

  useEffect(() => { const t = setTimeout(() => setQApplied(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const afterChange = (m, msg) => { queue.remove(m.userId); reloadCounts(); if (msg) showToast(msg); };

  const doSuspend = (m) => { reasonRef.current = ''; ask({
    icon: '🛡', title: `Suspend ${m.name}?`, scope: 'mentors.manage', danger: true,
    body: <>They drop out of public search immediately and cannot be booked. Existing confirmed sessions are untouched. Reversible with Reinstate.</>,
    notify: `${m.name} — "Mentor profile suspended" (+ your reason).`, confirmLabel: 'Suspend',
    children: <ReasonBox onChange={(v) => { reasonRef.current = v; }} />,
    run: async () => afterChange(await liveApi.adminSuspendMentor(m.userId, reasonRef.current.trim() || undefined), `${m.name} suspended`),
  }); };
  const doReinstate = (m) => ask({
    icon: '✅', title: `Reinstate ${m.name}?`, scope: 'mentors.manage',
    body: <>They return to public search and can be booked again.</>,
    notify: `${m.name} — "You're back on the marketplace".`, confirmLabel: 'Reinstate',
    run: async () => afterChange(await liveApi.adminReinstateMentor(m.userId), `${m.name} reinstated`),
  });

  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Mentor directory</h1>
        <Btn variant="ghost" onClick={() => { queue.reload(); reloadCounts(); }}>↻ Refresh</Btn>
      </div>
      <p className="text-muted" style={{ fontSize: 14 }}>Every mentor, whatever their status. Suspend hides an approved mentor from students; reinstate restores them. Every action is audited.</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0 12px' }}>
        <StatusTabs statuses={ALL_STATUSES} value={status} counts={counts} onChange={setStatus} />
        <Input placeholder="Filter by name / college / email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260, marginLeft: 'auto' }} />
      </div>
      <Status loading={queue.loading} err={queue.err} empty={queue.items.length === 0} emptyMsg={`No ${STATUS_META[status]?.label.toLowerCase()} mentors${qApplied ? ' match that filter' : ''}.`} onRetry={queue.reload}>
        <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 720 }}>
            <thead><tr><th>Mentor</th><th>College</th><th>Branch</th><th>Status</th><th>Since</th><th>Rating</th><th>Price</th><th></th></tr></thead>
            <tbody>
              {queue.items.map((m) => (
                <MentorRows key={m.userId} m={m} open={historyId === m.userId} onToggleHistory={() => setHistoryId(historyId === m.userId ? null : m.userId)} onOpen={() => setOpenId(m.userId)} onSuspend={() => doSuspend(m)} onReinstate={() => doReinstate(m)} />
              ))}
            </tbody>
          </table>
        </div>
        {queue.hasMore && <div style={{ marginTop: 12 }}><Btn variant="sec" onClick={queue.loadMore} disabled={queue.more}>{queue.more ? 'Loading…' : 'Load more'}</Btn></div>}
      </Status>
      {openId && <ApplicationDetail id={openId} onClose={() => setOpenId(null)} onChanged={(app) => { if (app.status !== status) queue.remove(app.userId); else queue.patch(app); reloadCounts(); }} />}
      {confirmEl}
    </section>
  );
}

// A reason box that lives inside the confirm dialog (uncontrolled → survives re-renders of the dialog).
function ReasonBox({ onChange }) {
  return <Field label="Reason (optional, audited + shown to the mentor)" style={{ marginTop: 8 }}><Input onChange={(e) => onChange(e.target.value)} placeholder="e.g. no-show at two sessions" /></Field>;
}

function MentorRows({ m, open, onToggleHistory, onOpen, onSuspend, onReinstate }) {
  const rating = m.ratingAvg != null ? Number(m.ratingAvg).toFixed(1) : '—';
  return (
    <>
      <tr>
        <td><div style={{ fontWeight: 600 }}>{m.name}</div><div className="text-muted" style={{ fontSize: 11.5 }}>{m.email || m.userId.slice(0, 10)}</div></td>
        <td>{m.college}</td>
        <td>{m.branch}</td>
        <td><StatusTag status={m.status} /></td>
        <td style={{ fontSize: 12.5 }}>{fmtWhen(m.statusChangedAt || m.updatedAt)}<div className="text-muted" style={{ fontSize: 11 }}>{waitOf(m.statusChangedAt || m.updatedAt)} ago</div></td>
        <td>⭐ {rating} <span className="text-muted" style={{ fontSize: 11 }}>({m.ratingCount ?? 0})</span></td>
        <td>₹{m.priceINR}</td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <Btn variant="ghost" onClick={onOpen} style={{ fontSize: 12.5 }}>Application</Btn>
          <Btn variant="ghost" onClick={onToggleHistory} style={{ fontSize: 12.5 }}>{open ? 'Hide history' : `History (${(m.history || []).length})`}</Btn>
          {m.status === 'APPROVED' && <Btn variant="ghost" style={{ color: '#a8442e', fontSize: 12.5 }} onClick={onSuspend}>Suspend</Btn>}
          {m.status === 'SUSPENDED' && <Btn variant="sec" onClick={onReinstate} style={{ fontSize: 12.5 }}>Reinstate</Btn>}
        </td>
      </tr>
      {open && (
        <tr><td colSpan={8} style={{ background: 'var(--color-bg)' }}>
          {(m.history || []).length === 0 ? <span className="text-muted" style={{ fontSize: 12.5 }}>No status changes recorded (pre-Phase-11 row).</span> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...m.history].reverse().map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="text-muted" style={{ minWidth: 150 }}>{fmtWhen(h.at)}</span>
                  {h.from && <><StatusTag status={h.from} style={{ padding: '1px 7px' }} /><span>→</span></>}<StatusTag status={h.to} style={{ padding: '1px 7px' }} />
                  <span className="text-muted">by {h.by === m.userId ? 'the mentor' : `${String(h.by).slice(0, 8)}…`}</span>
                  {h.note && <span>— {h.note}</span>}
                </div>
              ))}
            </div>
          )}
        </td></tr>
      )}
    </>
  );
}

// ── Interview calendar ────────────────────────────────────────────────────────
export function AInterviews() {
  const { showToast } = useApp();
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [editId, setEditId] = useState(null);
  const { ask, confirmEl } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      // Walk the whole INTERVIEW_SCHEDULED partition (small) so the calendar is complete.
      const all = []; let cursor = null; let hops = 0;
      do {
        const r = await liveApi.adminMentorQueue({ status: 'INTERVIEW_SCHEDULED', limit: 100, ...(cursor ? { cursor } : {}) });
        all.push(...(r.items || [])); cursor = r.nextCursor; hops++;
      } while (cursor && hops < 10);
      all.sort((a, b) => Date.parse(a.interview?.interviewAt || 0) - Date.parse(b.interview?.interviewAt || 0));
      setItems(all);
    } catch (e) { setErr(errMsg(e, 'mentors.manage')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const upcoming = (items || []).filter((m) => Date.parse(m.interview?.interviewAt || 0) >= now - 60 * 60000);
  const past = (items || []).filter((m) => Date.parse(m.interview?.interviewAt || 0) < now - 60 * 60000);

  const replace = (app) => setItems((cur) => (cur || []).map((m) => (m.userId === app.userId ? app : m)).filter((m) => m.status === 'INTERVIEW_SCHEDULED').sort((a, b) => Date.parse(a.interview?.interviewAt || 0) - Date.parse(b.interview?.interviewAt || 0)));

  const doCancel = (m) => ask({
    icon: '🗓', title: `Cancel ${m.name}'s interview?`, scope: 'mentors.interview', danger: true,
    body: <>The Calendar event is deleted and the application goes back to <em>Docs verified</em>, ready to be rescheduled.</>,
    notify: `${m.name} — "Interview cancelled — we will schedule a new one"${m.interview?.provider === 'google' ? ' + the Calendar cancellation email' : ''}.`, confirmLabel: 'Cancel interview',
    run: async () => { replace(await liveApi.mentorCancelInterview(m.userId)); showToast('Interview cancelled'); },
  });

  const Row = ({ m, muted }) => {
    const iv = m.interview || {};
    return (
      <div className="card elev-sm" style={{ background: muted ? 'var(--color-neutral-100)' : 'var(--color-surface)', gap: 6 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700 }}>{fmtWhen(iv.interviewAt)} <span className="text-muted" style={{ fontWeight: 400 }}>· {iv.durationMin || 15} min</span></div>
            <div style={{ fontSize: 13 }}>{m.name} · {m.college} · {m.branch}{m.email ? ` · ${m.email}` : ''}</div>
            {iv.note && <div className="text-muted" style={{ fontSize: 12 }}>Note: {iv.note}</div>}
          </div>
          {iv.meetUrl && <a className="sc-btn sec" href={iv.meetUrl} target="_blank" rel="noreferrer">🎥 Meet{iv.provider === 'stub' ? ' (placeholder)' : iv.provider === 'external' ? ' (external)' : ''}</a>}
          <Btn variant="sec" onClick={() => setEditId(editId === m.userId ? null : m.userId)}>Reschedule</Btn>
          <Btn variant="ghost" style={{ color: '#a8442e' }} onClick={() => doCancel(m)}>Cancel</Btn>
        </div>
        {editId === m.userId && <Reschedule m={m} ask={ask} onDone={(app) => { replace(app); setEditId(null); showToast('Interview rescheduled'); }} onCancel={() => setEditId(null)} />}
      </div>
    );
  };

  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h1 style={{ margin: 0, fontSize: 26 }}>Interview calendar</h1><span className="tag tag-accent">{items ? `${upcoming.length} upcoming` : '…'}</span><Btn variant="ghost" onClick={load}>↻ Refresh</Btn></div>
      <p className="text-muted" style={{ fontSize: 14 }}>Every scheduled screening interview, soonest first. Rescheduling moves the same Calendar event; cancelling returns the application to <em>Docs verified</em>.</p>
      <Status loading={loading} err={err} empty={(items || []).length === 0} emptyMsg="No interviews scheduled. Schedule one from the verification queue once an application is docs-verified." onRetry={load}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {upcoming.map((m) => <Row key={m.userId} m={m} />)}
          {past.length > 0 && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Held / overdue — record the decision from the verification queue:</div>}
          {past.map((m) => <Row key={m.userId} m={m} muted />)}
        </div>
      </Status>
      {confirmEl}
    </section>
  );
}

function Reschedule({ m, ask, onDone, onCancel }) {
  const [when, setWhen] = useState(toLocalInput(m.interview?.interviewAt));
  const [duration, setDuration] = useState(String(m.interview?.durationMin || 15));
  const iso = fromLocalInput(when);
  const valid = !!iso && Date.parse(iso) > Date.now();
  const submit = () => ask({
    icon: '📅', title: 'Reschedule the interview?', scope: 'mentors.interview',
    body: <>The same Calendar event moves to <strong>{fmtWhen(iso)}</strong> ({duration} min).</>,
    notify: `${m.name} — "Interview rescheduled" + an updated Calendar invite when the Google provider is on.`, confirmLabel: 'Reschedule',
    run: async () => onDone(await liveApi.mentorRescheduleInterview(m.userId, { interviewAt: iso, durationMin: Number(duration) })),
  });
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--color-bg)', borderRadius: 12, padding: 10 }}>
      <Field label="New date & time" style={{ flex: 1, minWidth: 200 }}><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      <Field label="Duration" style={{ width: 120 }}><Select value={duration} onChange={(e) => setDuration(e.target.value)}>{[10, 15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}</Select></Field>
      <Btn variant="pri" onClick={submit} disabled={!valid}>Reschedule…</Btn>
      <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      {when && !valid && <Note tone="warn" style={{ width: '100%' }}>Pick a future date and time.</Note>}
    </div>
  );
}

