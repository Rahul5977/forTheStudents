'use client';
// ══════════════════════════════════════════════════════════════════════════
// Verification queue [CRITICAL] + the application detail (Phase 11 packet 7).
// Status tabs with counts · oldest-first · wait time · text filter · cursor paging.
// Detail: every field + essays side-by-side with the documents (short-lived presigned
// previews, audited per click), per-field Verify / Flag, "N of M verified", and ONLY
// the actions the backend says are legal right now (`legalActions`). Every state change
// goes through an inline confirm that names who gets notified.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn, Input, Field, Select } from '@/components/ui';
import {
  CRIT, STATUS_META, QUEUE_STATUSES, ALL_STATUSES, StatusTag, StatusTabs, FIELD_LABELS, REQUIRED_FIELDS, OPTIONAL_FIELDS,
  fieldValue, fmtWhen, waitOf, toLocalInput, fromLocalInput, errMsg, Note, Status, useConfirm, useQueue, useCounts,
} from './admin-shared';

const initials = (name = '') => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
const palette = ['#c0492e', '#728157', '#d67f48', '#7a5c8f', '#3f7a8c'];
const FIELD_STYLE = { VERIFIED: { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' }, FLAGGED: CRIT, UNVERIFIED: { background: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)' } };

// ── Verification queue ────────────────────────────────────────────────────────
export function AVerifyQueue() {
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [openId, setOpenId] = useState(null);
  const queue = useQueue(status, qApplied);
  const { counts, reload: reloadCounts } = useCounts();

  useEffect(() => { const t = setTimeout(() => setQApplied(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const onChanged = useCallback((app) => {
    // A transition moves the row to another status partition → drop it from this list.
    if (app && app.status !== status) queue.remove(app.userId); else if (app) queue.patch(app);
    reloadCounts();
  }, [queue, status, reloadCounts]);

  const waiting = QUEUE_STATUSES.reduce((n, s) => n + (counts?.[s] || 0), 0);
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Mentor verification queue</h1>
        <span className="tag" style={CRIT}>CRITICAL · {counts ? waiting : '…'} waiting</span>
        <Btn variant="ghost" onClick={() => { queue.reload(); reloadCounts(); }}>↻ Refresh</Btn>
      </div>
      <p className="text-muted" style={{ fontSize: 14 }}>The trust gate for the whole marketplace. Every detail is verified by hand, oldest application first.</p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0 12px' }}>
        <StatusTabs statuses={ALL_STATUSES} value={status} counts={counts} onChange={(s) => { setStatus(s); setOpenId(null); }} />
        <Input placeholder="Filter by name / college / email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260, marginLeft: 'auto' }} />
      </div>
      <Note style={{ marginBottom: 12 }}>{STATUS_META[status]?.hint} Sorted oldest-first so nobody waits longer than they must.</Note>

      <Status loading={queue.loading} err={queue.err} empty={queue.items.length === 0} emptyMsg={qApplied ? 'No applications match that filter.' : status === 'PENDING_REVIEW' ? '🎉 Queue is clear — no applications awaiting review.' : `No ${STATUS_META[status]?.label.toLowerCase()} applications.`} onRetry={queue.reload}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {queue.items.map((v, ix) => <QueueCard key={v.userId} v={v} ix={ix} onOpen={() => setOpenId(v.userId)} />)}
        </div>
        {queue.hasMore && <div style={{ marginTop: 12 }}><Btn variant="sec" onClick={queue.loadMore} disabled={queue.more}>{queue.more ? 'Loading…' : 'Load more'}</Btn></div>}
      </Status>

      {openId && <ApplicationDetail id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} />}
    </section>
  );
}

function QueueCard({ v, ix, onOpen }) {
  const p = v.progress || {};
  return (
    <div className="card elev-sm" style={{ background: 'var(--color-surface)', cursor: 'pointer' }} onClick={onOpen}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ width: 42, height: 42, borderRadius: '50%', background: palette[ix % palette.length], color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>{initials(v.name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{v.name}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>{v.college} · Y{v.year}{v.branch ? ` · ${v.branch}` : ''}</div>
        </div>
        <StatusTag status={v.status} />
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: 12.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="tag tag-neutral" style={{ padding: '1px 7px' }}>⏱ waiting {waitOf(v.waitingSince)}</span>
        {p.required != null && <span className="tag" style={{ padding: '1px 7px', ...(p.complete ? FIELD_STYLE.VERIFIED : FIELD_STYLE.UNVERIFIED) }}>{p.verified} of {p.required} verified{p.flagged ? ` · ${p.flagged} flagged` : ''}</span>}
        {v.interview?.interviewAt && <span className="tag tag-accent" style={{ padding: '1px 7px' }}>📅 {fmtWhen(v.interview.interviewAt)}</span>}
      </div>
      <div style={{ fontSize: 12.5 }} className="text-muted">📧 {v.email || 'no verified email'} · 🪪 ID {v.documents?.id_card ? 'uploaded' : 'missing'}</div>
      <Btn variant="sec" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Open application →</Btn>
    </div>
  );
}

// ── Document preview (short-lived presigned URL, minted per click — audited) ──
function DocumentPreview({ id, docType, doc }) {
  const [state, setState] = useState({ url: null, expiresAt: 0, contentType: null, loading: false, err: null });
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!state.url) return undefined; const t = setInterval(() => setTick((n) => n + 1), 5000); return () => clearInterval(t); }, [state.url]);
  const expired = state.url && Date.now() > state.expiresAt;
  const mint = async () => {
    setState((s) => ({ ...s, loading: true, err: null }));
    try {
      const r = await liveApi.adminMentorDocumentUrl(id, docType);
      setState({ url: r.url, expiresAt: Date.now() + (r.expiresInSec || 180) * 1000, contentType: r.contentType, loading: false, err: null });
    } catch (e) { setState((s) => ({ ...s, loading: false, err: errMsg(e, 'mentors.manage') })); }
  };
  const label = FIELD_LABELS[docType === 'id_card' ? 'doc_id_card' : 'doc_supporting'];
  if (!doc) return <div className="card" style={{ background: 'var(--color-bg)' }}><div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div><p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Not uploaded{docType === 'supporting' ? ' (optional)' : ''}.</p></div>;
  const secsLeft = Math.max(0, Math.round((state.expiresAt - Date.now()) / 1000));
  void tick;
  return (
    <div className="card" style={{ background: 'var(--color-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div><div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div><div className="text-muted" style={{ fontSize: 12 }}>{doc.contentType} · {Math.round((doc.sizeBytes || 0) / 1024)} KB · uploaded {fmtWhen(doc.uploadedAt)}</div></div>
        <Btn variant={state.url && !expired ? 'ghost' : 'sec'} onClick={mint} disabled={state.loading}>{state.loading ? 'Minting…' : state.url ? (expired ? 'Re-mint preview' : `Preview · ${secsLeft}s`) : '👁 Preview (audited)'}</Btn>
      </div>
      {state.err && <Note tone="warn">{state.err}</Note>}
      {state.url && !expired && (
        String(state.contentType || '').startsWith('image/')
          ? <img src={state.url} alt={label} style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 12, border: '1px solid var(--color-divider)', objectFit: 'contain', background: '#fff' }} />
          : <iframe src={state.url} title={label} style={{ width: '100%', height: 420, border: '1px solid var(--color-divider)', borderRadius: 12, background: '#fff' }} />
      )}
      {state.url && expired && <Note>Preview link expired (they live ~3 minutes). Mint a new one to look again — every preview is written to the audit trail.</Note>}
    </div>
  );
}

// ── Per-field row ─────────────────────────────────────────────────────────────
function FieldRow({ app, fieldKey, canEdit, onSet, busyKey }) {
  const f = app.fields?.[fieldKey] || { status: 'UNVERIFIED' };
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState('');
  const isEssay = fieldKey.startsWith('essay');
  const busy = busyKey === fieldKey;
  const submitFlag = () => { if (note.trim().length < 3) return; onSet(fieldKey, 'FLAGGED', note.trim()); setFlagging(false); setNote(''); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '9px 0', borderBottom: '1px solid var(--color-divider)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="text-muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{FIELD_LABELS[fieldKey]}{OPTIONAL_FIELDS.includes(fieldKey) ? ' · optional' : ''}</div>
          <div style={{ fontSize: isEssay ? 13 : 14, whiteSpace: isEssay ? 'pre-wrap' : 'normal', lineHeight: isEssay ? 1.55 : 1.4 }}>{fieldValue(app, fieldKey)}</div>
          {f.note && <div style={{ fontSize: 12, ...CRIT, borderRadius: 8, padding: '3px 8px', display: 'inline-block', marginTop: 4 }}>🚩 {f.note}</div>}
          {f.by && <div className="text-muted" style={{ fontSize: 11 }}>{f.status.toLowerCase()} by {f.by.slice(0, 8)}… · {fmtWhen(f.at)}</div>}
        </div>
        <span className="tag" style={{ ...FIELD_STYLE[f.status] || FIELD_STYLE.UNVERIFIED, alignSelf: 'center' }}>{f.status === 'VERIFIED' ? '✓ Verified' : f.status === 'FLAGGED' ? '🚩 Flagged' : 'Unverified'}</span>
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, alignSelf: 'center' }}>
            {f.status !== 'VERIFIED' && <Btn variant="pri" onClick={() => onSet(fieldKey, 'VERIFIED')} disabled={busy} style={{ padding: '5px 12px', fontSize: 12.5 }}>{busy ? '…' : 'Verify'}</Btn>}
            {f.status !== 'FLAGGED' && <Btn variant="sec" onClick={() => setFlagging((v) => !v)} disabled={busy} style={{ padding: '5px 12px', fontSize: 12.5, color: '#a8442e' }}>Flag</Btn>}
            {f.status !== 'UNVERIFIED' && <Btn variant="ghost" onClick={() => onSet(fieldKey, 'UNVERIFIED')} disabled={busy} style={{ padding: '5px 8px', fontSize: 12 }} title="Reset to unverified">↺</Btn>}
          </div>
        )}
      </div>
      {flagging && canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Why is this flagged? (shown to the admin team; the mentor is told a detail needs another look)" style={{ flex: 1, minWidth: 220 }}><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. roll number differs from the ID card" /></Field>
          <Btn variant="pri" onClick={submitFlag} disabled={note.trim().length < 3 || busy} style={{ background: '#a8442e' }}>Flag it</Btn>
          <Btn variant="ghost" onClick={() => setFlagging(false)}>Cancel</Btn>
        </div>
      )}
    </div>
  );
}

// ── Application detail (modal) ────────────────────────────────────────────────
export function ApplicationDetail({ id, onClose, onChanged }) {
  const { showToast } = useApp();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [panel, setPanel] = useState(null); // 'schedule' | 'reschedule' | 'reject'
  const { ask, confirmEl } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setApp(await liveApi.adminMentor(id)); }
    catch (e) { setErr(errMsg(e, 'mentors.manage')); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const applied = (next, msg) => { setApp(next); onChanged?.(next); if (msg) showToast(msg); setPanel(null); };

  const setField = async (fieldKey, status, note) => {
    setBusyKey(fieldKey);
    try {
      const next = await liveApi.adminMentorField(id, fieldKey, status, note);
      applied(next, status === 'FLAGGED' ? `${FIELD_LABELS[fieldKey]} flagged — the mentor is told a detail needs another look` : status === 'VERIFIED' ? `${FIELD_LABELS[fieldKey]} verified` : `${FIELD_LABELS[fieldKey]} reset`);
      if (app?.status === 'DOCS_VERIFIED' && next.status === 'PENDING_REVIEW') showToast('Application moved back to Pending review');
    } catch (e) { showToast(errMsg(e, 'mentors.manage')); }
    finally { setBusyKey(null); }
  };

  if (!app && loading) return <Backdrop onClose={onClose}><p className="text-muted">Loading application…</p></Backdrop>;
  if (err) return <Backdrop onClose={onClose}><Note tone="warn">{err}</Note><Btn variant="sec" onClick={load} style={{ marginTop: 8 }}>Retry</Btn></Backdrop>;
  if (!app) return null;

  const la = app.legalActions || {};
  const prog = app.progress || { verified: 0, required: REQUIRED_FIELDS.length, remaining: [] };
  const present = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS.filter((k) => app.fields?.[k] || (k === 'essayOther' ? app.essays?.other : app.documents?.supporting))];
  const identity = present.filter((k) => !k.startsWith('essay') && !k.startsWith('doc_'));
  const essays = present.filter((k) => k.startsWith('essay'));

  const doVerifyDocs = () => ask({
    icon: '🪪', title: 'Mark documents verified?', scope: 'mentors.manage',
    body: <>All {prog.required} required items are verified. <strong>{app.name}</strong> moves to <em>Docs verified</em> and becomes eligible for an interview.</>,
    notify: `${app.name} — "Documents verified — next step: a short screening interview".`, confirmLabel: 'Mark verified',
    run: async () => applied(await liveApi.adminMentorVerifyDocs(id), 'Documents verified'),
  });
  const doApprove = () => ask({
    icon: '✅', title: `Approve ${app.name} as a mentor?`, scope: 'mentors.manage',
    body: <>They go LIVE on the marketplace immediately: students can find and book them at ₹{app.priceINR}/session. Their college, branch, year and price lock.</>,
    notify: `${app.name} — "You're a verified mentor ✅".`, confirmLabel: 'Approve',
    run: async () => applied(await liveApi.mentorReview(id, 'approve', undefined), `${app.name} approved`),
  });
  const doCancelInterview = () => ask({
    icon: '🗓', title: 'Cancel the interview?', scope: 'mentors.interview', danger: true,
    body: <>The Calendar event is deleted and the application returns to <em>Docs verified</em>. Nothing else changes.</>,
    notify: `${app.name} — "Interview cancelled — we will schedule a new one"${app.interview?.provider === 'google' ? ' + the Calendar cancellation' : ''}.`, confirmLabel: 'Cancel interview',
    run: async () => applied(await liveApi.mentorCancelInterview(id), 'Interview cancelled'),
  });

  return (
    <Backdrop onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ width: 48, height: 48, borderRadius: '50%', background: palette[0], color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 18 }}>{initials(app.name)}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>{app.name}</div>
          <div className="text-muted" style={{ fontSize: 13 }}>{app.college} · {app.branch} · Year {app.year} · applied {fmtWhen(app.submittedAt || app.createdAt)} · waiting {waitOf(app.waitingSince)}</div>
        </div>
        <StatusTag status={app.status} />
        <Btn variant="ghost" onClick={onClose}>✕ Close</Btn>
      </div>

      {/* Progress */}
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12, gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{prog.verified} of {prog.required} verified{prog.flagged ? <span style={{ ...CRIT, borderRadius: 8, padding: '2px 8px', fontSize: 12, marginLeft: 8 }}>{prog.flagged} flagged</span> : null}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="pri" onClick={doVerifyDocs} disabled={!la.verifyDocs} title={la.verifyDocs ? '' : app.status === 'PENDING_REVIEW' ? `Still unverified: ${(prog.remaining || []).map((k) => FIELD_LABELS[k] || k).join(', ')}` : 'Only from Pending review'}>🪪 Verify documents</Btn>
            <Btn variant="sec" onClick={() => setPanel(panel === 'schedule' ? null : 'schedule')} disabled={!la.scheduleInterview} title={la.scheduleInterview ? '' : 'Verify every item first'}>📅 Schedule interview</Btn>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 8, background: 'var(--color-neutral-200)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.round(100 * (prog.verified || 0) / (prog.required || 1))}%`, background: prog.complete ? 'var(--color-accent-2)' : 'var(--color-accent)' }} /></div>
        {app.status === 'INTERVIEW_SCHEDULED' && <Note>Verification is frozen while an interview is scheduled — cancel the interview to change a field.</Note>}
        {app.rejection && <Note tone="warn">Last decision: <strong>{app.rejection.kind} reject</strong> — “{app.rejection.reason}” ({fmtWhen(app.rejection.at)})</Note>}
      </div>

      {/* Interview */}
      {app.interview && (
        <div className="card" style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', marginTop: 12, gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 14 }}>📅 <strong>Interview {fmtWhen(app.interview.interviewAt)}</strong> · {app.interview.durationMin} min · <a href={app.interview.meetUrl} target="_blank" rel="noreferrer">Meet link</a>{app.interview.provider === 'stub' && <span className="tag tag-neutral" style={{ marginLeft: 6, padding: '1px 6px' }}>placeholder link</span>}{app.interview.provider === 'external' && <span className="tag tag-neutral" style={{ marginLeft: 6, padding: '1px 6px' }}>external link</span>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {la.rescheduleInterview && <Btn variant="sec" onClick={() => setPanel(panel === 'reschedule' ? null : 'reschedule')}>Reschedule</Btn>}
              {la.cancelInterview && <Btn variant="ghost" onClick={doCancelInterview} style={{ color: '#a8442e' }}>Cancel interview</Btn>}
            </div>
          </div>
          {app.interview.note && <div style={{ fontSize: 12.5 }}>Note: {app.interview.note}</div>}
        </div>
      )}
      {(panel === 'schedule' || panel === 'reschedule') && <InterviewForm app={app} mode={panel} onDone={applied} onCancel={() => setPanel(null)} ask={ask} />}

      {/* Identity / contact / profile fields */}
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12, gap: 0 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, marginBottom: 4 }}>Details</div>
        {identity.map((k) => <FieldRow key={k} app={app} fieldKey={k} canEdit={!!la.verifyFields} onSet={setField} busyKey={busyKey} />)}
        <div style={{ fontSize: 12.5, paddingTop: 8 }} className="text-muted">Bio: {app.bio || '—'} · Topics: {(app.topics || []).join(', ') || '—'} · Languages: {(app.languages || []).join(', ') || '—'} · Price ₹{app.priceINR} · Consent {app.consent ? `v${app.consent.version} on ${fmtWhen(app.consent.acceptedAt)}` : 'not given'}</div>
      </div>

      {/* Essays side-by-side with documents */}
      <div className="dash-2col" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, marginTop: 12 }}>
        <div className="card" style={{ background: 'var(--color-surface)', gap: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, marginBottom: 4 }}>Essays</div>
          {essays.map((k) => <FieldRow key={k} app={app} fieldKey={k} canEdit={!!la.verifyFields} onSet={setField} busyKey={busyKey} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="card" style={{ background: 'var(--color-surface)', gap: 0 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, marginBottom: 4 }}>Documents</div>
            <FieldRow app={app} fieldKey="doc_id_card" canEdit={!!la.verifyFields} onSet={setField} busyKey={busyKey} />
            {(app.documents?.supporting || app.fields?.doc_supporting) && <FieldRow app={app} fieldKey="doc_supporting" canEdit={!!la.verifyFields} onSet={setField} busyKey={busyKey} />}
          </div>
          <DocumentPreview id={id} docType="id_card" doc={app.documents?.id_card} />
          <DocumentPreview id={id} docType="supporting" doc={app.documents?.supporting} />
        </div>
      </div>

      {/* Decision */}
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Decision</div>
            <div className="text-muted" style={{ fontSize: 12.5 }}>{la.approve ? 'Interview done? Approve or reject.' : app.status === 'APPROVED' ? 'Approved — moderation lives in the Mentors directory.' : app.status === 'REJECTED' ? 'Rejected — terminal.' : 'Approval unlocks after the interview is scheduled and held.'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="pri" onClick={doApprove} disabled={!la.approve} title={la.approve ? '' : 'Only after the interview'}>Approve</Btn>
            <Btn variant="sec" onClick={() => setPanel(panel === 'reject' ? null : 'reject')} disabled={!la.reject && !la.softReject} style={{ color: '#a8442e' }}>Reject / send back</Btn>
          </div>
        </div>
        {panel === 'reject' && <RejectForm app={app} onDone={applied} onCancel={() => setPanel(null)} ask={ask} />}
      </div>

      {/* History */}
      {Array.isArray(app.history) && app.history.length > 0 && (
        <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12, gap: 4 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Status history</div>
          {[...app.history].reverse().map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="text-muted" style={{ minWidth: 150 }}>{fmtWhen(h.at)}</span>
              {h.from && <><StatusTag status={h.from} style={{ padding: '1px 7px' }} /><span>→</span></>}<StatusTag status={h.to} style={{ padding: '1px 7px' }} />
              <span className="text-muted">by {h.by === app.userId ? 'the mentor' : `${String(h.by).slice(0, 8)}…`}</span>
              {h.note && <span>— {h.note}</span>}
            </div>
          ))}
        </div>
      )}
      {confirmEl}
    </Backdrop>
  );
}

function Backdrop({ children, onClose, wide }) {
  return (
    <div className="dialog-backdrop" style={{ zIndex: 70, alignItems: 'flex-start', overflowY: 'auto', padding: '24px 12px' }} onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: wide ? 1040 : 520, width: '100%', textAlign: 'left', alignItems: 'stretch', margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}

function InterviewForm({ app, mode, onDone, onCancel, ask }) {
  const reschedule = mode === 'reschedule';
  const [when, setWhen] = useState(reschedule ? toLocalInput(app.interview?.interviewAt) : '');
  const [duration, setDuration] = useState(String(app.interview?.durationMin || 15));
  const [note, setNote] = useState(app.interview?.note || '');
  const iso = fromLocalInput(when);
  const valid = !!iso && Date.parse(iso) > Date.now();
  const submit = () => ask({
    icon: '📅', title: reschedule ? 'Reschedule the interview?' : 'Schedule the screening interview?', scope: 'mentors.interview',
    body: <>{reschedule ? 'The same Calendar event moves to' : 'A Calendar event with a Meet link is created for'} <strong>{fmtWhen(iso)}</strong> ({duration} min) with <strong>{app.name}</strong>{app.email ? ` (${app.email})` : ''} and you as attendees.{!reschedule && ' The application moves to Interview scheduled and verification freezes.'}</>,
    notify: `${app.name} — in-app "${reschedule ? 'Interview rescheduled' : 'Mentor interview scheduled'}" + a Calendar invite by email when the Google provider is on (placeholder link otherwise).`,
    confirmLabel: reschedule ? 'Reschedule' : 'Schedule',
    run: async () => onDone(reschedule
      ? await liveApi.mentorRescheduleInterview(app.userId, { interviewAt: iso, durationMin: Number(duration), note: note.trim() || undefined })
      : await liveApi.mentorScheduleInterview(app.userId, { interviewAt: iso, durationMin: Number(duration), note: note.trim() || undefined }), reschedule ? 'Interview rescheduled' : 'Interview scheduled'),
  });
  return (
    <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{reschedule ? 'Reschedule interview' : 'Schedule interview'}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Date & time (your local time)" style={{ flex: 1, minWidth: 200 }}><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="Duration" style={{ width: 130 }}><Select value={duration} onChange={(e) => setDuration(e.target.value)}>{[10, 15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}</Select></Field>
      </div>
      <Field label="Note for the mentor (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. keep your college ID handy" /></Field>
      {when && !valid && <Note tone="warn">Pick a future date and time.</Note>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="pri" onClick={submit} disabled={!valid}>{reschedule ? 'Reschedule…' : 'Schedule…'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

function RejectForm({ app, onDone, onCancel, ask }) {
  const la = app.legalActions || {};
  const [kind, setKind] = useState(la.softReject ? 'soft' : 'hard');
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 5;
  const submit = () => ask({
    icon: kind === 'soft' ? '✏️' : '⛔', title: kind === 'soft' ? `Send ${app.name}'s application back?` : `Reject ${app.name} permanently?`, scope: 'mentors.manage', danger: kind === 'hard',
    body: kind === 'soft'
      ? <>The application returns to <em>Draft</em>. The mentor sees your reason, fixes it and can re-submit. Any scheduled interview is cancelled.</>
      : <>This is <strong>terminal</strong>: the mentor cannot re-apply with this account, any interview is cancelled and their uploaded ID documents are scheduled for deletion.</>,
    notify: `${app.name} — "${kind === 'soft' ? 'Please update your application' : 'Application not approved'}: ${reason.trim()}".`,
    confirmLabel: kind === 'soft' ? 'Send back' : 'Reject permanently',
    run: async () => onDone(await liveApi.mentorReview(app.userId, 'reject', reason.trim(), kind), kind === 'soft' ? 'Sent back to the mentor' : `${app.name} rejected`),
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        <label className={`seg-opt${kind === 'soft' ? ' on' : ''}`} onClick={() => la.softReject && setKind('soft')} style={{ opacity: la.softReject ? 1 : 0.5 }}>Send back (soft)</label>
        <label className={`seg-opt${kind === 'hard' ? ' on' : ''}`} onClick={() => la.reject && setKind('hard')} style={{ opacity: la.reject ? 1 : 0.5 }}>Reject (hard, terminal)</label>
      </div>
      <Field label={kind === 'soft' ? 'What must the mentor fix? (shown to them)' : 'Reason (shown to the mentor; required)'}><textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="At least 5 characters" rows={3} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="pri" onClick={submit} disabled={!ok} style={{ background: kind === 'hard' ? '#a8442e' : undefined }}>{kind === 'soft' ? 'Send back…' : 'Reject…'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}
