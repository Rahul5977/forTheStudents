'use client';
// ══════════════════════════════════════════════════════════════════════════
// Mentor application (Phase 11 packet 6): the status timeline (the whole
// pre-approval experience) + the multi-step application form (DRAFT only).
// Backed by liveApi.mentorProfile / mentorApply / mentorVerifyEmail /
// mentorUploadDocument / mentorSubmit. Completeness comes from the server's
// `completeness.missing` — every missing item, never just the first.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn, Field, Input, Select } from '@/components/ui';
import { Status, useMentorProfile, useConfirm, CONSENT_VERSION, fmtFull, fmtDate, CRIT, OK, WARN } from './mentor-shared';

const TOPICS = ['Branch choice', 'Placements', 'Hostel', 'Campus life', 'CSE vs ECE', 'Cutoff trends', 'Interview prep', 'Exam strategy'];
const LANGS = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Gujarati'];
const ESSAY_MIN = 100; const ESSAY_MAX = 800;
const FIELD_LABEL = {
  name: 'Full name', college: 'College', branch: 'Branch', year: 'Year', gradYear: 'Graduation year', rollNumber: 'Roll number',
  collegeEmail: 'College email', phone: 'Phone', jeeRank: 'JEE rank', essayWhy: 'Essay: why mentor', essayHow: 'Essay: how you help',
  essayOther: 'Essay: anything else', doc_id_card: 'College ID card', doc_supporting: 'Supporting document',
};
const STAGES = ['PENDING_REVIEW', 'DOCS_VERIFIED', 'INTERVIEW_SCHEDULED', 'DECISION'];
const STAGE_LABEL = { PENDING_REVIEW: 'Submitted', DOCS_VERIFIED: 'Docs verified', INTERVIEW_SCHEDULED: 'Interview scheduled', DECISION: 'Decision' };

// ── Status timeline ──────────────────────────────────────────────────────────
function stageIndex(status) {
  if (status === 'PENDING_REVIEW') return 0;
  if (status === 'DOCS_VERIFIED') return 1;
  if (status === 'INTERVIEW_SCHEDULED') return 2;
  if (status === 'APPROVED' || status === 'REJECTED' || status === 'SUSPENDED') return 3;
  return -1; // DRAFT / none
}

export function StatusTimeline({ mentor }) {
  const status = mentor?.status;
  const idx = stageIndex(status);
  const reached = (h) => (mentor?.history || []).find((x) => x.to === h)?.at;
  return (
    <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
      <div className="card-kicker">Your application</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 6 }}>
        {STAGES.map((s, i) => {
          const done = idx > i || (idx === 3 && i === 3 && status === 'APPROVED');
          const current = idx === i && !(idx === 3 && status === 'APPROVED');
          const failed = i === 3 && status === 'REJECTED';
          const bg = failed ? '#7a2d1a' : done ? 'var(--color-accent-2-500)' : current ? 'var(--color-accent)' : 'var(--color-neutral-200)';
          const when = i === 3 ? (reached('APPROVED') || reached('REJECTED')) : reached(s);
          return (
            <div key={s} style={{ textAlign: 'center' }}>
              <div style={{ height: 8, borderRadius: 999, background: bg }} />
              <div style={{ fontSize: 12, marginTop: 6, fontWeight: current ? 700 : 500 }}>{failed ? '✗ ' : done ? '✓ ' : ''}{STAGE_LABEL[s]}</div>
              {when && <div className="text-muted" style={{ fontSize: 10.5 }}>{fmtDate(when)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageCopy({ mentor }) {
  const s = mentor?.status;
  const flagged = Object.entries(mentor?.fields || {}).filter(([, v]) => v.status === 'FLAGGED');
  const verified = Object.values(mentor?.fields || {}).filter((v) => v.status === 'VERIFIED').length;
  const total = Object.keys(mentor?.fields || {}).length;
  const iv = mentor?.interview;
  const link = iv?.meetUrl || mentor?.interviewLink;
  const at = iv?.interviewAt || mentor?.interviewAt;
  if (s === 'PENDING_REVIEW' || s === 'DOCS_VERIFIED') return (
    <div className="card" style={{ background: 'var(--color-accent-100)', marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{s === 'DOCS_VERIFIED' ? '🪪 Every detail verified' : '⏳ Under manual review'}</div>
      <p style={{ fontSize: 13, margin: 0 }}>{s === 'DOCS_VERIFIED'
        ? 'An admin checked every detail and document. Next: a short 10–15 min screening interview — we will schedule it and send you a calendar invite.'
        : `An admin verifies each detail by hand — ${verified} of ${total} items checked so far. Most applications are reviewed within 24–48 hours.`}</p>
      {flagged.length > 0 && (
        <div style={{ ...CRIT, borderRadius: 10, padding: '8px 11px', fontSize: 12.5 }}>
          <strong>Flagged for a second look:</strong> {flagged.map(([k, v]) => `${FIELD_LABEL[k] || k}${v.note ? ` (${v.note})` : ''}`).join(' · ')}. No action needed yet — we&apos;ll reach out if we need anything.
        </div>
      )}
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>What happens next: docs verified → interview → decision. You&apos;ll get a notification at each step.</p>
    </div>
  );
  if (s === 'INTERVIEW_SCHEDULED') return (
    <div className="card" style={{ background: 'var(--color-accent-100)', marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>📅 Interview scheduled</div>
      <div style={{ fontSize: 14 }}><strong>{fmtFull(at)}</strong>{iv?.durationMin ? ` · ${iv.durationMin} min` : ''}</div>
      {link && <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>🎥 Join on Google Meet{iv?.provider === 'stub' ? ' (placeholder link — the real one arrives with your calendar invite)' : ''}</a>}
      {iv?.note && <p style={{ fontSize: 13, margin: 0 }}>Note from the team: “{iv.note}”</p>}
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Keep your college ID handy. The decision follows right after the interview.</p>
    </div>
  );
  if (s === 'APPROVED') return (
    <div className="card" style={{ background: 'var(--color-accent-2-100)', marginTop: 12 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>You&apos;re a verified mentor 🎉</div><p style={{ fontSize: 13, margin: 0 }}>Students see your verified badge. Set your availability so they can book you.</p><Btn variant="pri" go="mAvailability" style={{ alignSelf: 'flex-start' }}>Set availability →</Btn></div>
  );
  if (s === 'SUSPENDED') return (
    <div className="card" style={{ ...CRIT, marginTop: 12 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Profile suspended</div><p style={{ fontSize: 13, margin: 0 }}>{mentor?.history?.slice(-1)[0]?.note ? `Reason: ${mentor.history.slice(-1)[0].note}` : 'An admin suspended your mentor profile.'} Contact support if you think this is a mistake.</p></div>
  );
  if (s === 'REJECTED') return (
    <div className="card" style={{ ...CRIT, marginTop: 12 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Application not approved</div><p style={{ fontSize: 13, margin: 0 }}>{mentor?.rejection?.reason || mentor?.reviewNote || 'The team could not approve this application.'}</p><p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>This decision is final — re-applying is not possible from this account. You can still use the student app.</p></div>
  );
  return null;
}

// ── The multi-step form (DRAFT only) ─────────────────────────────────────────
function formFrom(m, profile) {
  return {
    name: m?.name || profile?.name || '', college: m?.college || '', branch: m?.branch || '', year: String(m?.year || 3),
    gradYear: m?.gradYear ? String(m.gradYear) : '', rollNumber: m?.rollNumber || '', phone: m?.phone || '',
    bio: m?.bio || '', topics: m?.topics || [], priceINR: String(m?.priceINR || 100), languages: m?.languages || [],
    jeeRank: m?.jeeRank ? String(m.jeeRank) : '', jeeYear: m?.jeeYear ? String(m.jeeYear) : '',
    why: m?.essays?.why || '', how: m?.essays?.how || '', other: m?.essays?.other || '',
    consent: !!m?.consent?.acceptedAt,
  };
}
function bodyFrom(f) {
  const num = (v) => (v === '' || v == null ? undefined : Number(v));
  const str = (v) => (v && v.trim() ? v.trim() : undefined);
  return {
    name: f.name.trim(), college: f.college.trim(), branch: f.branch.trim(), year: Number(f.year) || 1,
    gradYear: num(f.gradYear), rollNumber: str(f.rollNumber), phone: str(f.phone.replace(/\s+/g, '')),
    bio: f.bio.trim() || undefined, topics: f.topics, priceINR: Number(f.priceINR) || 100, languages: f.languages,
    jeeRank: num(f.jeeRank), jeeYear: num(f.jeeYear),
    essays: { why: f.why || undefined, how: f.how || undefined, other: f.other || undefined },
    ...(f.consent ? { consent: { accepted: true, version: CONSENT_VERSION } } : {}),
  };
}
const Counter = ({ v }) => { const n = (v || '').trim().length; const ok = n >= ESSAY_MIN && n <= ESSAY_MAX; return <span className="text-muted" style={{ fontSize: 11.5, color: ok ? 'var(--color-accent-2-800)' : undefined }}>{n} / {ESSAY_MAX} {ok ? '✓' : `(min ${ESSAY_MIN})`}</span>; };
const Chips = ({ all, on, toggle }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{all.map((t) => { const isOn = on.includes(t); return <span key={t} className={isOn ? 'tag tag-accent' : 'tag tag-neutral'} onClick={() => toggle(t)} style={{ cursor: 'pointer' }}>{t}{isOn ? ' ✓' : ''}</span>; })}</div>
);

export function ApplicationForm({ mentor, setMentor, onSubmitted }) {
  const { profile, showToast, loadMentorStatus } = useApp();
  const [form, setForm] = useState(() => formFrom(mentor, profile));
  const [otp, setOtp] = useState({ email: mentor?.email || '', code: '', devOtp: '' });
  const [busy, setBusy] = useState('');
  const [missing, setMissing] = useState(null);
  const confirm = useConfirm();
  useEffect(() => { setForm(formFrom(mentor, profile)); if (mentor?.email) setOtp((o) => ({ ...o, email: mentor.email })); }, [mentor, profile]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleIn = (k, t) => setForm((f) => ({ ...f, [k]: f[k].includes(t) ? f[k].filter((x) => x !== t) : [...f[k], t] }));
  const hasApp = !!mentor;
  const doc = (t) => mentor?.documents?.[t];

  const saveDraft = async (quiet) => {
    if (!form.name.trim() || form.college.trim().length < 2 || form.branch.trim().length < 2) { showToast('Add your name, college and branch first.'); return null; }
    setBusy('save');
    try { const m = await liveApi.mentorApply(bodyFrom(form)); setMentor(m); if (!quiet) showToast('Draft saved'); await loadMentorStatus(); return m; }
    catch (e) { showToast(e.message || 'Could not save your draft'); return null; }
    finally { setBusy(''); }
  };
  const sendOtp = async () => {
    if (!hasApp) { const m = await saveDraft(true); if (!m) return; }
    setBusy('otp');
    try { const r = await liveApi.mentorVerifyEmail(otp.email.trim()); setOtp((o) => ({ ...o, devOtp: r.devOtp || '' })); showToast(r.devOtp ? `Dev OTP: ${r.devOtp}` : 'Code sent — check your college inbox'); }
    catch (e) { showToast(e.message || 'Could not send the code'); }
    finally { setBusy(''); }
  };
  const confirmOtp = async () => {
    setBusy('otp');
    try { const r = await liveApi.mentorVerifyEmail(otp.email.trim(), otp.code.trim()); setMentor(r.mentor); showToast('College email verified ✓'); }
    catch (e) { showToast(e.message || 'Could not verify the code'); }
    finally { setBusy(''); }
  };
  const upload = async (docType, file) => {
    if (!file) return;
    if (!hasApp) { const m = await saveDraft(true); if (!m) return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Max 5 MB'); return; }
    setBusy(docType);
    try { const r = await liveApi.mentorUploadDocument(docType, file); setMentor(r.mentor); showToast(docType === 'id_card' ? 'ID card uploaded' : 'Document uploaded'); }
    catch (e) { showToast(e.message || 'Upload failed'); }
    finally { setBusy(''); }
  };
  const submit = async () => {
    const saved = await saveDraft(true);
    if (!saved) return;
    if (!saved.completeness?.complete) { setMissing(saved.completeness?.missing || []); showToast('A few things are still missing'); return; }
    confirm.ask({
      title: 'Submit your application?', confirmLabel: 'Submit for review',
      body: 'Your details, essays and documents go to our admin team for manual verification. You cannot edit them while under review.',
      notify: 'you (application received) and the admin team',
    }, async () => {
      setBusy('submit');
      try { const m = await liveApi.mentorSubmit(); setMentor(m); setMissing(null); await loadMentorStatus(); showToast('Application submitted 🎉'); onSubmitted?.(m); }
      catch (e) {
        showToast(e.message || 'Could not submit');
        try { const m = await liveApi.mentorProfile(); setMentor(m); setMissing(m.completeness?.missing || []); } catch { /* keep */ }
      } finally { setBusy(''); }
    });
  };

  const card = { background: 'var(--color-surface)', marginTop: 12 };
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 };
  const isMissing = (k) => (missing || []).some((m) => m.field === k);
  const mark = (k) => (isMissing(k) ? { outline: '2px solid #a8442e', borderRadius: 12 } : undefined);
  return (
    <>
      {mentor?.rejection?.kind === 'soft' && (
        <div className="card" style={{ ...WARN, marginTop: 12 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>✏️ Please fix and re-submit</div><p style={{ fontSize: 13, margin: 0 }}>Reviewer&apos;s note: “{mentor.rejection.reason || mentor.reviewNote}”</p></div>
      )}
      {missing && missing.length > 0 && (
        <div className="card" style={{ ...CRIT, marginTop: 12 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>Still missing ({missing.length})</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>{missing.map((m) => <li key={m.field}><strong>{FIELD_LABEL[m.field] || m.field}:</strong> {m.message}</li>)}</ul>
        </div>
      )}
      <div className="card" style={card}><div className="card-kicker">Step 1 · Identity</div>
        <div style={gridStyle}>
          <Field label="Full name" style={mark('name')}><Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="As on your college ID" /></Field>
          <Field label="College" style={mark('college')}><Input value={form.college} onChange={(e) => set({ college: e.target.value })} placeholder="IIT Bombay" /></Field>
          <Field label="Branch" style={mark('branch')}><Input value={form.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="Computer Science" /></Field>
          <Field label="Current year" style={mark('year')}><Select value={form.year} onChange={(e) => set({ year: e.target.value })}>{[1, 2, 3, 4, 5].map((y) => <option key={y}>{y}</option>)}</Select></Field>
          <Field label="Graduation year" style={mark('gradYear')}><Input type="number" value={form.gradYear} onChange={(e) => set({ gradYear: e.target.value })} placeholder="2027" /></Field>
          <Field label="Roll number" style={mark('rollNumber')}><Input value={form.rollNumber} onChange={(e) => set({ rollNumber: e.target.value })} placeholder="21B0123" /></Field>
        </div>
      </div>
      <div className="card" style={card}><div className="card-kicker">Step 2 · Contact</div>
        <Field label="Phone" style={{ ...mark('phone'), maxWidth: 260 }}><Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="9876543210" /></Field>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, alignItems: 'center' }}>College email (.ac.in){mentor?.emailVerified ? <span className="tag tag-accent-2">✓ {mentor.email}</span> : <span className="tag tag-neutral">Not verified</span>}</div>
        {!mentor?.emailVerified && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end', ...mark('collegeEmail') }}>
            <Field label="Your .ac.in email" style={{ flex: 1, minWidth: 180 }}><Input placeholder="you@iitb.ac.in" value={otp.email} onChange={(e) => setOtp({ ...otp, email: e.target.value })} /></Field>
            <Btn variant="sec" onClick={sendOtp} disabled={busy === 'otp' || !otp.email}>Send code</Btn>
            <Field label={`Code${otp.devOtp ? ` (dev: ${otp.devOtp})` : ''}`} style={{ width: 120 }}><Input value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value })} placeholder="6 digits" /></Field>
            <Btn variant="pri" onClick={confirmOtp} disabled={busy === 'otp' || otp.code.length !== 6}>Verify</Btn>
          </div>
        )}
      </div>
      <div className="card" style={card}><div className="card-kicker">Step 3 · Documents</div>
        {[['id_card', 'College ID card (required)', 'doc_id_card'], ['supporting', 'Supporting document — admit card / fee receipt / degree certificate (optional)', 'doc_supporting']].map(([t, label, k]) => (
          <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 12, border: '1.5px dashed var(--color-divider)', ...mark(k) }}>
            <span style={{ fontSize: 20 }}>{t === 'id_card' ? '🪪' : '📄'}</span>
            <div style={{ flex: 1, minWidth: 160, fontSize: 13 }}>
              <div>{label}</div>
              {doc(t) ? <div className="text-muted" style={{ fontSize: 12 }}>✓ {doc(t).contentType} · {Math.round(doc(t).sizeBytes / 1024)} KB · {fmtDate(doc(t).uploadedAt)}{t === 'id_card' && mentor?.fields?.doc_id_card?.status === 'FLAGGED' ? ' · ⚠ flagged — re-upload' : ''}</div> : <div className="text-muted" style={{ fontSize: 12 }}>JPEG, PNG, WebP or PDF · max 5 MB · stored privately</div>}
            </div>
            <label className="sc-btn sec" style={{ cursor: 'pointer' }}>{busy === t ? 'Uploading…' : doc(t) ? 'Replace' : 'Upload'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} disabled={busy === t} onChange={(e) => { upload(t, e.target.files?.[0]); e.target.value = ''; }} /></label>
          </div>
        ))}
      </div>
      <div className="card" style={card}><div className="card-kicker">Step 4 · Profile</div>
        <Field label="Short bio (how students see you)" style={mark('bio')}><textarea className="input" value={form.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="CSE senior — happy to talk branch trade-offs, hostel life and placements." /></Field>
        <div style={mark('topics')}><div style={{ fontSize: 12.5, marginBottom: 4 }}>Topics you can help with</div><Chips all={TOPICS} on={form.topics} toggle={(t) => toggleIn('topics', t)} /></div>
        <div><div style={{ fontSize: 12.5, margin: '6px 0 4px' }}>Languages</div><Chips all={LANGS} on={form.languages} toggle={(t) => toggleIn('languages', t)} /></div>
        <div style={gridStyle}>
          <Field label="Price per session (₹)" style={mark('priceINR')}><Input type="number" value={form.priceINR} onChange={(e) => set({ priceINR: e.target.value })} /></Field>
          <Field label="Your JEE rank (AIR)" style={mark('jeeRank')}><Input type="number" value={form.jeeRank} onChange={(e) => set({ jeeRank: e.target.value })} placeholder="812" /></Field>
          <Field label="JEE year" style={mark('jeeYear')}><Input type="number" value={form.jeeYear} onChange={(e) => set({ jeeYear: e.target.value })} placeholder="2023" /></Field>
        </div>
      </div>
      <div className="card" style={card}><div className="card-kicker">Step 5 · Essays</div>
        <Field label="Why do you want to become a mentor? (required)" style={mark('essayWhy')}><textarea className="input" rows={4} maxLength={ESSAY_MAX} value={form.why} onChange={(e) => set({ why: e.target.value })} /><Counter v={form.why} /></Field>
        <Field label="How will you help a student during JoSAA counselling? (required)" style={mark('essayHow')}><textarea className="input" rows={4} maxLength={ESSAY_MAX} value={form.how} onChange={(e) => set({ how: e.target.value })} /><Counter v={form.how} /></Field>
        <Field label="Anything else we should know? (optional)"><textarea className="input" rows={2} maxLength={ESSAY_MAX} value={form.other} onChange={(e) => set({ other: e.target.value })} /></Field>
      </div>
      <div className="card" style={{ ...card, ...mark('consent') }}><div className="card-kicker">Step 6 · Code of conduct</div>
        <label className="radio" style={{ alignItems: 'flex-start' }}><input type="checkbox" checked={form.consent} onChange={(e) => set({ consent: e.target.checked })} /><span className="dot" style={{ marginTop: 3 }} /><span style={{ fontSize: 13 }}>I agree to the mentor code of conduct (v{CONSENT_VERSION}): I&apos;ll be honest about my college, respectful to every student (many are minors), keep sessions on counselling, and never share a student&apos;s details. Accepted on {mentor?.consent?.acceptedAt ? fmtDate(mentor.consent.acceptedAt) : 'submit'}.</span></label>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <Btn variant="sec" onClick={() => saveDraft(false)} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save draft'}</Btn>
        <Btn variant="pri" onClick={submit} disabled={!!busy} style={{ flex: 1 }}>{busy === 'submit' ? 'Submitting…' : 'Submit application'}</Btn>
      </div>
      <confirm.Modal />
    </>
  );
}

// ── Verification center = application status + form ──────────────────────────
export function MVerification() {
  const { mentor, setMentor, loading, err, reload } = useMentorProfile();
  const status = mentor?.status;
  const editable = !mentor || status === 'DRAFT';
  const tag = useMemo(() => {
    if (!status) return null;
    const map = { DRAFT: ['tag tag-neutral', 'Draft'], PENDING_REVIEW: ['tag tag-accent', '⏳ Under review'], DOCS_VERIFIED: ['tag tag-accent', '🪪 Docs verified'], INTERVIEW_SCHEDULED: ['tag tag-accent', '📅 Interview'], APPROVED: ['tag tag-accent-2', '✔ Approved'], SUSPENDED: ['tag', 'Suspended'], REJECTED: ['tag', 'Not approved'] };
    const [cls, label] = map[status] || ['tag tag-neutral', status];
    return <span className={cls} style={cls === 'tag' ? CRIT : undefined}>{label}</span>;
  }, [status]);
  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '26px 24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h1 style={{ margin: '0 0 2px', fontSize: 28 }}>{editable ? 'Mentor application' : 'Application status'}</h1>{tag}<Btn variant="ghost" onClick={reload}>↻</Btn></div>
      <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>{editable ? 'Every detail is verified manually by our team — take your time and be accurate.' : 'Submitted → Docs verified → Interview → Decision. We notify you at every step.'}</p>
      <Status loading={loading} err={err} onRetry={reload}>
        {mentor && <StatusTimeline mentor={mentor} />}
        <StageCopy mentor={mentor} />
        {editable ? <ApplicationForm mentor={mentor} setMentor={setMentor} /> : (
          <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
            <div className="card-kicker">Submitted details</div>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div><strong>{mentor.name}</strong> · {mentor.college} · {mentor.branch} · Year {mentor.year}{mentor.gradYear ? ` (grad ${mentor.gradYear})` : ''}</div>
              <div>{mentor.email} · {mentor.phone || '—'} · Roll {mentor.rollNumber || '—'}</div>
              <div>Documents: {mentor.documents?.id_card ? '🪪 ID card ✓' : 'ID card missing'}{mentor.documents?.supporting ? ' · 📄 supporting ✓' : ''}</div>
              {mentor.submittedAt && <div className="text-muted">Submitted {fmtFull(mentor.submittedAt)}</div>}
            </div>
            {status !== 'APPROVED' && status !== 'SUSPENDED' && <div style={{ ...OK, borderRadius: 10, padding: '8px 11px', fontSize: 12.5 }}>Details are locked while under review. If something is wrong, the team will send it back to you with a note.</div>}
          </div>
        )}
      </Status>
    </section>
  );
}
