'use client';
// ══════════════════════════════════════════════════════════════════════════
// Counsellor / Mentor app (10 screens) — WIRED to the live backend.
//   • mentorProfile()  → status / bio / topics / price / verification flags
//   • sessions()       → the caller's MENTORING sessions (mentorId === my userId)
//   • mentorApply()    → create / edit the mentor profile
//   • mentorVerifyEmail / mentorVerifyId → the verification flow (mirrors /live)
//   • mentorAvailability() / putMentorAvailability() → weekly bookable slots
//   • join() / end()   → the live-session saga
//   • notifications from the store feed
// Visual design (organic cream/terracotta/sage, ui.js primitives) is preserved —
// only data sources + action handlers changed. Owner TODOs mark missing surfaces.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn, Field, Input, Select } from '@/components/ui';

// ── platform economics ──────────────────────────────────────────────────────
const MENTOR_SHARE = 0.8;      // mentor keeps 80%; platform fee is 20%
const SESSION_MIN = 25;

const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const initialsOf = (name = '') =>
  name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'M';
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—');
const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Time TBD';
function fmtTime(t) {
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

// Session-status → chance chip colours (reuses the app's Safe/Target/Reach system).
function statusStyle(status) {
  if (status === 'CONFIRMED' || status === 'LIVE') return { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' };
  if (status === 'PENDING_PAYMENT') return { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' };
  return { background: '#f7e2db', color: '#7a2d1a' };
}
const isDone = (s) => s.status === 'ENDED' || s.status === 'RATED';

// Loading / error / empty wrapper — mirrors the pattern used in admin.js.
function Status({ loading, err, empty, emptyMsg = 'Nothing here yet.', onRetry, children }) {
  if (loading) return <p className="text-muted" style={{ fontSize: 13, margin: '6px 0' }}>Loading…</p>;
  if (err) return (
    <div className="card" style={{ background: '#f7e2db', color: '#7a2d1a', fontSize: 13 }}>
      ⚠ {err}{onRetry && <> — <button className="sc-btn ghost" style={{ padding: '0 6px', color: '#7a2d1a' }} onClick={onRetry}>retry</button></>}
    </div>
  );
  if (empty) return <p className="text-muted" style={{ fontSize: 13, margin: '6px 0' }}>{emptyMsg}</p>;
  return children;
}

// Fetch the caller's OWN mentor profile (404 = not a mentor yet → null, not an error).
function useMentorProfile() {
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
function useMyMentoringSessions() {
  const { sessions, profile } = useApp();
  return useMemo(() => {
    const uid = profile?.userId;
    const list = Array.isArray(sessions) ? sessions : [];
    const mine = uid ? list.filter((s) => s.mentorId === uid) : list;
    return mine;
  }, [sessions, profile?.userId]);
}

// ── Mentor Dashboard ────────────────────────────────────────────────────────
export function MDashboard() {
  const { profile, join, navigate, loadSessions, showToast } = useApp();
  const { mentor } = useMentorProfile();
  const mySessions = useMyMentoringSessions();

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const upcoming = useMemo(
    () => mySessions
      .filter((s) => s.status === 'CONFIRMED' || s.status === 'LIVE')
      .sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0)),
    [mySessions],
  );
  const completed = useMemo(() => mySessions.filter(isDone), [mySessions]);
  const now = new Date();
  const thisMonthEarn = completed
    .filter((s) => { const d = s.startsAt ? new Date(s.startsAt) : null; return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((sum, s) => sum + (s.priceINR || 0) * MENTOR_SHARE, 0);
  const totalEarn = completed.reduce((sum, s) => sum + (s.priceINR || 0) * MENTOR_SHARE, 0);
  const rating = mentor?.ratingAvg;
  const ratingCount = mentor?.ratingCount ?? 0;

  const joinSession = async (s) => { await join(s.id); navigate('mSession'); };

  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '26px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>Welcome back, {profile?.name?.split(' ')[0] || 'mentor'}</h1>
        <label className="radio" style={{ background: 'var(--color-accent-2-100)', borderRadius: 999, padding: '8px 14px' }}>
          {/* TODO(owner): an "accepting bookings" flag needs a mentor-availability endpoint. */}
          <input type="checkbox" defaultChecked={mentor?.status === 'APPROVED'} onChange={() => showToast('Availability is managed on the Availability screen')} /><span className="dot" />Available for bookings
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div className="card-kicker">This month</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>{inr(thisMonthEarn)}</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Total earned</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>{inr(totalEarn)}</div><div className="text-muted" style={{ fontSize: 11 }}>{completed.length} completed</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Upcoming</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>{upcoming.length}</div><div className="text-muted" style={{ fontSize: 11 }}>confirmed sessions</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Rating</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>{rating != null ? `${rating.toFixed ? rating.toFixed(1) : rating} ⭐` : '—'}</div><div className="text-muted" style={{ fontSize: 11 }}>{ratingCount} rated</div></div>
      </div>
      <div className="dash-2col" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 14 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>Upcoming sessions</div><Btn variant="ghost" go="mBookings">See all</Btn></div>
          {upcoming.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13, margin: '8px 0 0' }}>No confirmed sessions yet — students book you from the marketplace once you&apos;re approved.</p>
          ) : upcoming.slice(0, 3).map((s) => {
            const label = s.studentName || s.mentorName || 'Student';
            return (
              <div key={s.id} className="card" style={{ background: 'var(--color-bg)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>{initialsOf(label)}</span>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{label} · {fmtWhen(s.startsAt)}</div><div className="text-muted" style={{ fontSize: 12 }}>{s.status === 'LIVE' ? 'Live now' : `${s.durationMin || SESSION_MIN} min · ${inr((s.priceINR || 0) * MENTOR_SHARE)} to you`}</div></div>
                <Btn variant="pri" onClick={() => joinSession(s)}>Join</Btn>
              </div>
            );
          })}
        </div>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-2-100)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Get more bookings</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}><li>Add 3+ availability slots this week</li><li>Reply to booking notes quickly</li><li>Keep your rating above 4.8</li></ul><Btn variant="sec" go="mAvailability">Set availability</Btn></div>
      </div>
    </section>
  );
}

// ── Mentor Profile Editor ─────────────────────────────────────────────────
export function MProfile() {
  const { showToast } = useApp();
  const { mentor, setMentor, loading, err, reload } = useMentorProfile();
  const [bio, setBio] = useState('');
  const [topics, setTopics] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mentor) {
      setBio(mentor.bio || '');
      setTopics((mentor.topics || []).join(', '));
      setPrice(String(mentor.priceINR ?? 100));
    }
  }, [mentor]);

  const approved = mentor?.status === 'APPROVED';

  const save = async () => {
    if (!mentor) return;
    setSaving(true);
    try {
      // mentorApply is the only mentor-profile write surface. College/branch/year are
      // locked after approval, so we send the existing (immutable) values unchanged.
      // TODO(owner): a dedicated PATCH /mentor/profile for bio/price edits that does
      // NOT re-trigger review; and a price-change-after-approval path.
      const body = {
        name: mentor.name,
        college: mentor.college,
        branch: mentor.branch,
        year: Number(mentor.year),
        priceINR: Number(price) || mentor.priceINR,
        topics: topics.split(',').map((s) => s.trim()).filter(Boolean),
        bio: bio.trim(),
      };
      const m = await liveApi.mentorApply(body);
      setMentor(m);
      showToast('Profile saved');
    } catch (e) { showToast(e.message || 'Could not save profile'); }
    finally { setSaving(false); }
  };

  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '26px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h1 style={{ margin: 0, fontSize: 28 }}>Profile editor</h1><Btn variant="sec" act="viewMentor" id="1">👁 Preview as student</Btn></div>
      <Status loading={loading} err={err} empty={!mentor} emptyMsg="You haven't applied as a mentor yet." onRetry={reload}>
        {mentor ? (
          <>
            <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 20 }}>{initialsOf(mentor.name)}</span>
                <Btn variant="sec" act="toast" msg="Photo upload is an owner TODO">Change photo</Btn>
              </div>
              <Field label="Short bio"><textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell students what you can help with…" /></Field>
              <Field label="Topics (comma-separated)"><Input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="CSE vs ECE, Placements, Campus life" /></Field>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {topics.split(',').map((t) => t.trim()).filter(Boolean).map((t, i) => <span key={i} className="tag tag-accent">{t}</span>)}
              </div>
            </div>
            <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
              <div className="card-kicker">{approved ? 'Locked after verification' : 'Set during application'}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Field label="College" style={{ flex: 1 }}><Input value={mentor.college || ''} disabled readOnly /></Field>
                <Field label="Branch" style={{ flex: 1 }}><Input value={mentor.branch || ''} disabled readOnly /></Field>
                <Field label="Year" style={{ width: 100 }}><Input value={mentor.year ?? ''} disabled readOnly /></Field>
              </div>
              <Field label="Price per session (₹)" style={{ width: 180 }}>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} disabled={approved} />
              </Field>
              {approved && <p className="text-muted" style={{ fontSize: 12 }}>Price is locked after approval. {/* TODO(owner): price-edit-after-approval endpoint */}Contact support to change it.</p>}
            </div>
            <Btn variant="pri" onClick={save} disabled={saving} block style={{ marginTop: 14 }}>{saving ? 'Saving…' : 'Save profile'}</Btn>
          </>
        ) : (
          <div className="card" style={{ background: 'var(--color-accent-2-100)', marginTop: 12 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Become a mentor first</div>
            <p style={{ fontSize: 13, margin: '4px 0 8px' }}>Apply and verify to unlock your profile editor.</p>
            <Btn variant="pri" go="mVerification">Go to verification →</Btn>
          </div>
        )}
      </Status>
    </section>
  );
}

// ── Availability / Calendar Management ────────────────────────────────────
// Loads the mentor's bookable slots, lets them toggle each open/closed, and
// persists the whole set. A brand-new mentor can add slots so students can book.
export function MAvailability() {
  const { showToast } = useApp();
  const [slots, setSlots] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newWhen, setNewWhen] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const r = await liveApi.mentorAvailability(); setSlots(r?.slots ?? []); }
    catch (e) { setErr(e.message || 'Could not load your availability'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const slotLabel = (s) => {
    if (s.startsAt) return new Date(s.startsAt).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    if (s.day || s.time) return `${s.day || ''} ${s.time || ''}`.trim();
    return s.id || 'Slot';
  };
  const toggle = (id) => setSlots((cur) => cur.map((s) => (s.id === id ? { ...s, open: !s.open } : s)));

  const addSlot = () => {
    const startsAt = newWhen ? new Date(newWhen).toISOString() : new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const n = (slots?.length || 0) + 1;
    setSlots((cur) => [...(cur || []), { id: `s${n}`, startsAt, durationMin: SESSION_MIN, open: true }]);
    setNewWhen('');
  };

  const save = async () => {
    setSaving(true);
    try { const r = await liveApi.putMentorAvailability(slots || []); setSlots(r?.slots ?? slots); showToast('Availability saved'); }
    catch (e) { showToast(e.message || 'Could not save availability'); }
    finally { setSaving(false); }
  };

  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 28 }}>Availability</h1>
      <p className="text-muted" style={{ fontSize: 14 }}>Tap a slot to toggle. Students can only book green slots.</p>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 10 }}>
        <Status loading={loading} err={err} empty={slots?.length === 0} emptyMsg="No slots yet — add one below so students can book you." onRetry={load}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {(slots ?? []).map((s) => (
              <div key={s.id} className="sc-tile" onClick={() => toggle(s.id)}
                style={{ minHeight: 46, borderRadius: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', border: '1px solid var(--color-divider)', background: s.open ? 'var(--color-accent-2-100)' : 'var(--color-neutral-100)', color: s.open ? 'var(--color-accent-2-800)' : 'var(--color-neutral-500)' }}>
                <span style={{ fontWeight: 700 }}>{slotLabel(s)}</span>
                <span style={{ fontSize: 11 }}>{s.open ? '✓ Open' : 'Closed'} · {s.durationMin || SESSION_MIN} min</span>
              </div>
            ))}
          </div>
        </Status>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <Field label="Add a slot (date & time)" style={{ flex: 1, minWidth: 200 }}><Input type="datetime-local" value={newWhen} onChange={(e) => setNewWhen(e.target.value)} /></Field>
        <Btn variant="sec" onClick={addSlot}>＋ Add slot</Btn>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <Field label="Timezone" style={{ flex: 1 }}><Input defaultValue="IST (GMT+5:30)" /></Field>
        <Field label="Buffer between sessions" style={{ flex: 1 }}><Select defaultValue="10 min"><option>5 min</option><option>10 min</option><option>15 min</option></Select></Field>
      </div>
      <Btn variant="pri" onClick={save} disabled={saving || loading} style={{ marginTop: 6 }}>{saving ? 'Saving…' : 'Save availability'}</Btn>
    </section>
  );
}

// ── Verification Center ───────────────────────────────────────────────────
// Mirrors the /live flow: apply → verify .ac.in email (OTP) → verify ID → review.
export function MVerification() {
  const { profile, showToast } = useApp();
  const { mentor, setMentor, loading, err, reload } = useMentorProfile();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ college: '', branch: '', year: 3, priceINR: 100, topics: '', acEmail: '', otp: '', devOtp: '' });

  const status = mentor?.status;

  const apply = async () => {
    setBusy(true);
    try {
      const m = await liveApi.mentorApply({
        name: profile?.name || 'Mentor',
        college: form.college, branch: form.branch,
        year: Number(form.year), priceINR: Number(form.priceINR),
        topics: form.topics.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setMentor(m); showToast('Applied — verify your .ac.in email next');
    } catch (e) { showToast(e.message || 'Could not apply'); }
    finally { setBusy(false); }
  };
  const sendOtp = async () => {
    setBusy(true);
    try { const r = await liveApi.mentorVerifyEmail(form.acEmail); setForm((f) => ({ ...f, devOtp: r.devOtp || '' })); showToast(r.devOtp ? `Dev OTP: ${r.devOtp}` : 'OTP sent'); }
    catch (e) { showToast(e.message || 'Could not send OTP'); }
    finally { setBusy(false); }
  };
  const confirmOtp = async () => {
    setBusy(true);
    try { const r = await liveApi.mentorVerifyEmail(form.acEmail, form.otp); setMentor(r.mentor); showToast('Email verified'); }
    catch (e) { showToast(e.message || 'Could not verify email'); }
    finally { setBusy(false); }
  };
  const verifyId = async () => {
    setBusy(true);
    try { const r = await liveApi.mentorVerifyId('id-proof-stub'); setMentor(r.mentor); showToast('ID submitted for review'); }
    catch (e) { showToast(e.message || 'Could not submit ID'); }
    finally { setBusy(false); }
  };

  const StatusTag = () => {
    if (status === 'APPROVED') return <span className="tag tag-accent-2">✔ Approved</span>;
    if (status === 'PENDING_REVIEW') return <span className="tag tag-accent">⏳ Pending review</span>;
    if (status === 'REJECTED') return <span className="tag" style={{ background: '#f7e2db', color: '#7a2d1a' }}>Rejected</span>;
    if (status) return <span className="tag tag-neutral">Draft</span>;
    return null;
  };

  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: '26px 24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h1 style={{ margin: '0 0 2px', fontSize: 28 }}>Verification center</h1><StatusTag /><Btn variant="ghost" onClick={reload}>↻</Btn></div>
      <Status loading={loading} err={err} onRetry={reload}>
        {/* Step 0 — not a mentor yet: apply. */}
        {!mentor && (
          <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Apply to become a mentor</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginTop: 6 }}>
              <Field label="College"><Input value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} placeholder="IIT Bombay" /></Field>
              <Field label="Branch"><Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="Computer Science" /></Field>
              <Field label="Year"><Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
              <Field label="Price ₹"><Input value={form.priceINR} onChange={(e) => setForm({ ...form, priceINR: e.target.value })} /></Field>
              <Field label="Topics (comma-separated)" style={{ gridColumn: '1 / -1' }}><Input value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} placeholder="CSE vs ECE, Placements" /></Field>
            </div>
            <Btn variant="pri" onClick={apply} disabled={busy} style={{ marginTop: 8 }}>{busy ? 'Applying…' : 'Apply as mentor'}</Btn>
          </div>
        )}

        {/* Step 1 — college email (.ac.in) OTP. */}
        {mentor && (
          <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, alignItems: 'center' }}>College email (.ac.in){mentor.emailVerified ? <span className="tag tag-accent-2">Verified</span> : <span className="tag tag-neutral">Not verified</span>}</div>
            {!mentor.emailVerified ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'flex-end' }}>
                <Field label="Your .ac.in email" style={{ flex: 1, minWidth: 160 }}><Input placeholder="you@iitb.ac.in" value={form.acEmail} onChange={(e) => setForm({ ...form, acEmail: e.target.value })} /></Field>
                <Btn variant="sec" onClick={sendOtp} disabled={busy}>Send OTP</Btn>
                <Field label={`OTP${form.devOtp ? ` (${form.devOtp})` : ''}`} style={{ width: 120 }}><Input value={form.otp} onChange={(e) => setForm({ ...form, otp: e.target.value })} /></Field>
                <Btn variant="pri" onClick={confirmOtp} disabled={busy}>Verify</Btn>
              </div>
            ) : <div className="text-muted" style={{ fontSize: 13 }}>Your college email is verified.</div>}
          </div>
        )}

        {/* Step 2 — student ID. */}
        {mentor && (
          <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, alignItems: 'center' }}>Student ID{mentor.idVerified ? <span className="tag tag-accent-2">Verified</span> : <span className="tag tag-neutral">Not submitted</span>}</div>
            {mentor.emailVerified && !mentor.idVerified && (
              <Btn variant="pri" onClick={verifyId} disabled={busy} style={{ marginTop: 8 }}>{busy ? 'Submitting…' : 'Submit student ID (stub)'}</Btn>
            )}
            {!mentor.emailVerified && <div className="text-muted" style={{ fontSize: 13 }}>Verify your college email first.</div>}
          </div>
        )}

        {/* Step 3 — review / approved. */}
        {status === 'PENDING_REVIEW' && (
          <div className="card" style={{ background: 'var(--color-accent-100)', marginTop: 12 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>⏳ Submitted for review</div><p style={{ fontSize: 13, margin: 0 }}>An admin will review your verification and approve you shortly.</p></div>
        )}
        {status === 'APPROVED' && (
          <div className="card" style={{ background: 'var(--color-accent-2-100)', marginTop: 12 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>You&apos;re a verified mentor 🎉</div><p style={{ fontSize: 13, margin: 0 }}>Students see your verified badge. Re-verify each academic year to keep it.</p></div>
        )}
        {status === 'REJECTED' && (
          <div className="card" style={{ background: '#f7e2db', color: '#7a2d1a', marginTop: 12 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Application not approved</div><p style={{ fontSize: 13, margin: 0 }}>{mentor?.reviewNote || 'Please review the requirements and re-apply.'}</p></div>
        )}
      </Status>
    </section>
  );
}

// ── Bookings / Session Requests ───────────────────────────────────────────
export function MBookings() {
  const { join, navigate, loadSessions } = useApp();
  const mySessions = useMyMentoringSessions();
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { setLoading(true); await loadSessions(); setLoading(false); })(); }, [loadSessions]);

  const sorted = useMemo(
    () => [...mySessions].sort((a, b) => new Date(b.startsAt || 0) - new Date(a.startsAt || 0)),
    [mySessions],
  );

  const joinSession = async (s) => { await join(s.id); navigate('mSession'); };

  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Bookings &amp; requests</h1>
        <Btn variant="ghost" onClick={loadSessions}>↻ Refresh</Btn>
      </div>
      <Status loading={loading} empty={sorted.length === 0} emptyMsg="No bookings yet — students will appear here once they book a session with you.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((s) => {
            const label = s.studentName || s.mentorName || 'Student';
            const canJoin = s.status === 'CONFIRMED' || s.status === 'LIVE';
            return (
              <div key={s.id} className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>{initialsOf(label)}</span>
                <div style={{ flex: 1, minWidth: 140 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{label} · {fmtWhen(s.startsAt)}</div><div className="text-muted" style={{ fontSize: 12 }}>{s.durationMin || SESSION_MIN} min · {inr(s.priceINR)} · {inr((s.priceINR || 0) * MENTOR_SHARE)} to you</div></div>
                <span className="tag" style={statusStyle(s.status)}>{s.status}{s.rating ? ` · ⭐${s.rating}` : ''}</span>
                {canJoin && <Btn variant="pri" onClick={() => joinSession(s)}>Join</Btn>}
              </div>
            );
          })}
        </div>
      </Status>
    </section>
  );
}

// ── Session Room (mentor side) [CORE] ─────────────────────────────────────
export function MSession() {
  const { sessTime, camOn, micOn, runAct, navigate, join, end, loadSessions } = useApp();
  const mySessions = useMyMentoringSessions();

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // The active session: prefer a LIVE one, else the soonest CONFIRMED.
  const active = useMemo(() => {
    const live = mySessions.find((s) => s.status === 'LIVE');
    if (live) return live;
    return mySessions
      .filter((s) => s.status === 'CONFIRMED')
      .sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0))[0] || null;
  }, [mySessions]);

  const studentLabel = active?.studentName || active?.mentorName || 'Student';
  const doJoin = async () => { if (active) await join(active.id); };
  const doEnd = async () => { if (active) await end(active.id); navigate('mDashboard'); };

  return (
    <section style={{ background: 'var(--color-neutral-900)', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', color: '#fff', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: active?.status === 'LIVE' ? '#5fce7f' : '#d9b25f', animation: 'pulse 1.6s infinite' }} />{active ? `Session with ${studentLabel}` : 'No active session'}</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, background: 'rgba(255,255,255,.1)', padding: '4px 16px', borderRadius: 999 }}>{fmtTime(sessTime)} / {String(active?.durationMin || SESSION_MIN).padStart(2, '0')}:00</div>
      </div>
      <div className="session-body" style={{ flex: 1, display: 'flex', gap: 14, padding: '0 20px 14px', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ flex: 1, minHeight: 320, borderRadius: 20, background: 'linear-gradient(135deg,#3d472b,#56633f)', position: 'relative', display: 'grid', placeItems: 'center' }}>
            <span style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 40 }}>{initialsOf(studentLabel)}</span>
            <div style={{ position: 'absolute', bottom: 14, left: 16, color: '#fff', fontSize: 14, background: 'rgba(0,0,0,.35)', padding: '4px 12px', borderRadius: 999 }}>{studentLabel} · Student</div>
            {active?.meetingUrl && <a href={active.meetingUrl} target="_blank" rel="noreferrer" style={{ position: 'absolute', top: 14, right: 16, color: '#fff', fontSize: 13, background: 'rgba(0,0,0,.4)', padding: '6px 12px', borderRadius: 999 }}>🎥 Open Meet{active.meetingProvider === 'stub' ? ' (placeholder)' : ''}</a>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="sc-btn" onClick={() => runAct({ act: 'toggleMic' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{micOn ? '🎤' : '🔇'}</button>
            <button className="sc-btn" onClick={() => runAct({ act: 'toggleCam' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{camOn ? '📷' : '🚫'}</button>
            {active?.status === 'CONFIRMED' && <button className="sc-btn" onClick={doJoin} style={{ background: 'var(--color-accent-2-500)', color: '#fff', padding: '0 22px', borderRadius: 999 }}>Start &amp; get link</button>}
            <button className="sc-btn" onClick={doEnd} style={{ background: '#a8442e', color: '#fff', padding: '0 22px', borderRadius: 999 }}>End session</button>
          </div>
        </div>
        <aside className="session-chat" style={{ flex: 'none', width: 280, background: 'var(--color-bg)', borderRadius: 18, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, marginBottom: 8 }}>Session details</div>
          {active ? (
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div><strong>Student:</strong> {studentLabel}</div>
              <div><strong>When:</strong> {fmtWhen(active.startsAt)}</div>
              <div><strong>Status:</strong> {active.status}</div>
              <div><strong>Duration:</strong> {active.durationMin || SESSION_MIN} min</div>
              <div><strong>You earn:</strong> {inr((active.priceINR || 0) * MENTOR_SHARE)}</div>
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: 13 }}>No confirmed session to join right now. Head back to your dashboard.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

// ── Earnings & Payouts ────────────────────────────────────────────────────
export function MEarnings() {
  const { loadSessions } = useApp();
  const mySessions = useMyMentoringSessions();
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { setLoading(true); await loadSessions(); setLoading(false); })(); }, [loadSessions]);

  const completed = useMemo(
    () => mySessions.filter(isDone).sort((a, b) => new Date(b.startsAt || 0) - new Date(a.startsAt || 0)),
    [mySessions],
  );
  const total = completed.reduce((sum, s) => sum + (s.priceINR || 0) * MENTOR_SHARE, 0);

  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Earnings &amp; payouts</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div className="card-kicker">Total earned</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{inr(total)}</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Pending payout</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>—</div><div className="text-muted" style={{ fontSize: 11 }}>ledger TODO</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Sessions</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{completed.length}</div></div>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Per-session breakdown</div>
          {/* TODO(owner): payout / withdrawal ledger has no backend surface yet. */}
          <Btn variant="pri" act="confirm" dialog="payout">Withdraw</Btn>
        </div>
        <Status loading={loading} empty={completed.length === 0} emptyMsg="No completed sessions yet — earnings appear here after a session ends.">
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 480 }}>
              <thead><tr><th>Date</th><th>Student</th><th>Fee</th><th>Platform (20%)</th><th>You get</th></tr></thead>
              <tbody>
                {completed.map((s) => {
                  const fee = s.priceINR || 0;
                  return (
                    <tr key={s.id}>
                      <td>{fmtDate(s.startsAt)}</td>
                      <td>{s.studentName || s.mentorName || 'Student'}</td>
                      <td>{inr(fee)}</td>
                      <td>{inr(fee * (1 - MENTOR_SHARE))}</td>
                      <td>{inr(fee * MENTOR_SHARE)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Status>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontSize: 14 }}>Payout method</div><div className="text-muted" style={{ fontSize: 13 }}>Add a UPI / bank account</div></div><Btn variant="sec" act="toast" msg="Payout method setup is an owner TODO">Manage</Btn></div>
    </section>
  );
}

// ── Reviews & Ratings ─────────────────────────────────────────────────────
export function MReviews() {
  const { mentor, loading: mLoading } = useMentorProfile();
  const { loadSessions } = useApp();
  const mySessions = useMyMentoringSessions();
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { setLoading(true); await loadSessions(); setLoading(false); })(); }, [loadSessions]);

  const rated = useMemo(
    () => mySessions.filter((s) => s.status === 'RATED' || s.rating != null)
      .sort((a, b) => new Date(b.startsAt || 0) - new Date(a.startsAt || 0)),
    [mySessions],
  );
  const avg = mentor?.ratingAvg;
  const count = mentor?.ratingCount ?? rated.length;

  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 28 }}>Reviews &amp; ratings</h1>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 40 }}>{avg != null ? (avg.toFixed ? avg.toFixed(1) : avg) : '—'}</span>
        <span className="text-muted">⭐ from {count} rated session{count === 1 ? '' : 's'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <Status loading={loading || mLoading} empty={rated.length === 0} emptyMsg="No reviews yet — ratings appear here after students rate a completed session.">
          {rated.map((s) => {
            const stars = '⭐'.repeat(Math.max(0, Math.min(5, Math.round(s.rating || 0))));
            return (
              <div key={s.id} className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontWeight: 700, fontSize: 14 }}>{s.studentName || s.mentorName || 'Student'} · {fmtDate(s.startsAt)}</div><div>{stars}</div></div>
                {s.comment && <p style={{ fontSize: 13, margin: '4px 0 0' }}>{s.comment}</p>}
              </div>
            );
          })}
        </Status>
      </div>
    </section>
  );
}

// ── Mentor Notifications ──────────────────────────────────────────────────
export function MNotifications() {
  const { notifications, unreadCount, markAllRead, markNotifRead, loadNotifs } = useApp();
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { setLoading(true); await loadNotifs(); setLoading(false); })(); }, [loadNotifs]);

  const list = Array.isArray(notifications) ? notifications : [];

  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: '26px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Notifications{unreadCount > 0 && <span className="tag tag-accent" style={{ marginLeft: 8, fontSize: 12 }}>{unreadCount} new</span>}</h1>
        {unreadCount > 0 && <Btn variant="sec" onClick={markAllRead}>Mark all read</Btn>}
      </div>
      <Status loading={loading} empty={list.length === 0} emptyMsg="You're all caught up — no notifications yet." onRetry={loadNotifs}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((n) => (
            <div key={n.id} onClick={() => !n.read && markNotifRead(n.id)}
              className="card elev-sm"
              style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 10, cursor: n.read ? 'default' : 'pointer', borderLeft: n.read ? '4px solid transparent' : '4px solid var(--color-accent)' }}>
              <span style={{ width: 7, height: 7, marginTop: 6, borderRadius: '50%', background: n.read ? 'transparent' : 'var(--color-accent)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div><div className="text-muted" style={{ fontSize: 13 }}>{n.body}</div></div>
              {n.link && <a href={n.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 13 }}>🎥</a>}
            </div>
          ))}
        </div>
      </Status>
    </section>
  );
}

// ── Mentor Settings ───────────────────────────────────────────────────────
export function MSettings() {
  const { runAct, switchRole, navigate } = useApp();
  const deactivate = async () => { await switchRole('student'); navigate('dashboard'); };
  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Settings</h1>
      <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Mentor mode</div><label className="radio"><input type="checkbox" defaultChecked /><span className="dot" />Accepting new bookings</label><label className="radio"><input type="checkbox" defaultChecked /><span className="dot" />Email me about new requests</label></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div className="card-kicker">Account</div><div className="sc-row" onClick={() => runAct({ act: 'toast', msg: 'Account settings is an owner TODO' })} style={{ padding: '8px 4px', fontSize: 14, cursor: 'pointer' }}>Account &amp; email ›</div><div className="sc-row" onClick={() => runAct({ go: 'mEarnings' })} style={{ padding: '8px 4px', fontSize: 14, cursor: 'pointer' }}>Payout method ›</div></div>
      <Btn variant="sec" onClick={deactivate} block style={{ marginTop: 14 }}>Deactivate mentor mode (switch to student)</Btn>
      <Btn variant="ghost" onClick={() => runAct({ act: 'logout' })} block style={{ color: '#a8442e', marginTop: 10 }}>Log out</Btn>
    </section>
  );
}
