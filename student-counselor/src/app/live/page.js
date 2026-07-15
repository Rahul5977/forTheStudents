'use client';
// ════════════════════════════════════════════════════════════════════════════
// LIVE integration page — the real login -> JWT -> /me loop against the backend.
// Dev mode (default) talks to the local auth-identity dev server + DynamoDB Local.
// Cognito mode uses the real Hosted UI (a real JWT). Everything shown here is
// read from / written to the actual database via the backend API.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react';
import { API_URL, AUTH_MODE, isCognito } from '@/lib/liveConfig';
import { devLogin, cognitoLoginUrl, captureCognitoRedirect, getToken, setToken, logout, decodeToken } from '@/lib/liveAuth';
import { liveApi } from '@/lib/liveApi';

const CATEGORIES = ['Open', 'OBC-NCL', 'SC', 'ST', 'EWS'];

export default function LivePage() {
  const [token, setTok] = useState(null);
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);

  const [email, setEmail] = useState('aarav@example.com');
  const [name, setName] = useState('Aarav Kumar');
  const [editName, setEditName] = useState('');
  const [rp, setRp] = useState({ advRank: 850, mainRank: 4200, category: 'Open', home: 'Maharashtra', gender: 'Male', pwd: false, branches: 'CSE, ECE', priority: 'branch' });
  const [showRaw, setShowRaw] = useState(false);
  const [pred, setPred] = useState(null);
  const [predBusy, setPredBusy] = useState(false);
  const [choice, setChoice] = useState(null); // { items, warnings, summary, choiceVersion }
  const [choiceBusy, setChoiceBusy] = useState(false);
  const [mentor, setMentor] = useState(null); // my mentor profile (or null)
  const [mentorList, setMentorList] = useState(null); // approved mentors (public)
  const [mBusy, setMBusy] = useState(false);
  const [mForm, setMForm] = useState({ college: 'IIT Bombay', branch: 'Computer Science', year: 3, priceINR: 100, topics: 'CSE vs ECE, Placements', acEmail: '', otp: '', devOtp: '' });
  const [sessions, setSessions] = useState(null); // my booking sessions
  const [sBusy, setSBusy] = useState(false);

  const flash = (m) => { setNote(m); setTimeout(() => setNote(null), 2200); };

  const loadProfile = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      await liveApi.bootstrap();        // idempotent — creates the row on first login
      const me = await liveApi.getMe(); // read back from the database
      setProfile(me);
      setEditName(me.name || '');
      if (me.rankPrefs) setRp({ ...me.rankPrefs, branches: (me.rankPrefs.branches || []).join(', ') });
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }, []);

  // On mount: capture a Cognito redirect, then load if we already have a token.
  useEffect(() => {
    if (isCognito()) captureCognitoRedirect();
    const t = getToken();
    if (t) { setTok(t); loadProfile(); }
  }, [loadProfile]);

  // Load the saved choice list + mentor data once we have a token.
  useEffect(() => {
    if (token) { loadChoice(); loadMentors(); loadMyMentor(); loadSessions(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const doDevLogin = async () => {
    setBusy(true); setErr(null);
    try { const t = await devLogin(email, name); setTok(t); await loadProfile(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const doLogout = () => { logout(); setTok(null); setProfile(null); flash('Logged out'); };

  const saveName = async () => {
    setBusy(true); setErr(null);
    try { const p = await liveApi.patchName(editName); setProfile(p); flash('Name saved to DB'); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const saveRankPrefs = async () => {
    setBusy(true); setErr(null);
    try {
      const payload = {
        advRank: Number(rp.advRank), mainRank: Number(rp.mainRank), category: rp.category,
        home: rp.home, gender: rp.gender, pwd: !!rp.pwd,
        branches: rp.branches.split(',').map((s) => s.trim()).filter(Boolean),
        priority: rp.priority,
      };
      const p = await liveApi.patchRankPrefs(payload); setProfile(p); flash('Rank & prefs saved to DB');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const doSwitchRole = async (role) => {
    setBusy(true); setErr(null);
    try { const p = await liveApi.switchRole(role); setProfile(p); flash(`Role → ${role}`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  // Phase 2: call the real public predictor with the current rank inputs.
  const runPredict = async () => {
    setPredBusy(true); setErr(null);
    try {
      const data = await liveApi.predict({ advRank: rp.advRank, mainRank: rp.mainRank, category: rp.category, home: rp.home });
      setPred(data);
      loadChoice(); // refresh buckets against the same rank
    } catch (e) { setErr(e.message); } finally { setPredBusy(false); }
  };

  // Phase 3: the planner. The doctor endpoint returns the decorated (bucketed)
  // choice list AND the List Doctor warnings in one call, so it doubles as "load".
  const loadChoice = useCallback(async () => {
    setChoiceBusy(true);
    try {
      setChoice(await liveApi.choiceDoctor({ advRank: rp.advRank, mainRank: rp.mainRank, category: rp.category, home: rp.home }));
    } catch (e) { setErr(e.message); } finally { setChoiceBusy(false); }
  }, [rp]);

  const currentIds = () => (choice?.items ?? []).map((i) => i.id);
  const inList = (id) => currentIds().includes(id);

  const addToList = async (id) => {
    if (inList(id)) { flash('Already in your list'); return; }
    setChoiceBusy(true); setErr(null);
    try { await liveApi.putChoiceList([...currentIds(), id], choice?.choiceVersion); await loadChoice(); flash('Added to choice list'); }
    catch (e) { setErr(e.message); } finally { setChoiceBusy(false); }
  };
  const removeFromList = async (id) => {
    setChoiceBusy(true); setErr(null);
    try { await liveApi.putChoiceList(currentIds().filter((x) => x !== id), choice?.choiceVersion); await loadChoice(); }
    catch (e) { setErr(e.message); } finally { setChoiceBusy(false); }
  };
  const moveChoice = async (from, to) => {
    if (to < 0 || to >= currentIds().length) return;
    setChoiceBusy(true); setErr(null);
    try { await liveApi.reorderChoice(from, to, choice?.choiceVersion); await loadChoice(); }
    catch (e) { setErr(e.message); } finally { setChoiceBusy(false); }
  };
  const doExport = async () => {
    try { const r = await liveApi.exportChoiceList(); flash(r?.message || 'Exported'); }
    catch { flash('PDF export is coming soon — for now copy the list into josaa.nic.in in this order.'); }
  };

  // Phase 4: marketplace. Browse (public) + the mentor apply → verify flow.
  const loadMentors = useCallback(async () => {
    try { setMentorList((await liveApi.mentors()).mentors); } catch (e) { setErr(e.message); }
  }, []);
  const loadMyMentor = useCallback(async () => {
    try { setMentor(await liveApi.mentorProfile()); } catch { setMentor(null); } // 404 = not a mentor yet
  }, []);

  const applyMentor = async () => {
    setMBusy(true); setErr(null);
    try {
      const m = await liveApi.mentorApply({
        name: profile?.name || 'Mentor', college: mForm.college, branch: mForm.branch,
        year: Number(mForm.year), priceINR: Number(mForm.priceINR),
        topics: mForm.topics.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setMentor(m); flash('Applied — verify your .ac.in email next');
    } catch (e) { setErr(e.message); } finally { setMBusy(false); }
  };
  const requestOtp = async () => {
    setMBusy(true); setErr(null);
    try { const r = await liveApi.mentorVerifyEmail(mForm.acEmail); setMForm((f) => ({ ...f, devOtp: r.devOtp || '' })); flash(r.devOtp ? `Dev OTP: ${r.devOtp}` : 'OTP sent'); }
    catch (e) { setErr(e.message); } finally { setMBusy(false); }
  };
  const confirmOtp = async () => {
    setMBusy(true); setErr(null);
    try { const r = await liveApi.mentorVerifyEmail(mForm.acEmail, mForm.otp); setMentor(r.mentor); flash('Email verified'); }
    catch (e) { setErr(e.message); } finally { setMBusy(false); }
  };
  const verifyIdStub = async () => {
    setMBusy(true); setErr(null);
    try { const r = await liveApi.mentorVerifyId('id-proof-stub'); setMentor(r.mentor); flash('ID step done'); await loadMentors(); }
    catch (e) { setErr(e.message); } finally { setMBusy(false); }
  };

  // Phase 5: booking sessions. Book a mentor's slot, then drive the saga.
  const loadSessions = useCallback(async () => {
    try { setSessions((await liveApi.sessions()).sessions); } catch (e) { setErr(e.message); }
  }, []);
  const bookMentor = async (mentorId) => {
    setSBusy(true); setErr(null);
    try { const r = await liveApi.createBooking(mentorId, 's1', `ui-${mentorId}-${Date.now()}`); flash(`Booked · ${r.booking.status}`); await loadSessions(); }
    catch (e) { setErr(e.message); } finally { setSBusy(false); }
  };
  const sAction = async (fn, id, ...args) => {
    setSBusy(true); setErr(null);
    try { await fn(id, ...args); await loadSessions(); }
    catch (e) { setErr(e.message); } finally { setSBusy(false); }
  };

  const claims = token ? decodeToken(token) : null;
  const card = { background: 'var(--color-surface)', marginBottom: 14 };
  const lbl = { fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' };
  const bucketStyle = (b) => b === 'safe'
    ? { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' }
    : b === 'target'
      ? { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' }
      : { background: '#f7e2db', color: '#7a2d1a' };
  const sevColor = (s) => (s === 'high' ? '#c0492e' : s === 'med' ? '#d67f48' : '#728157');

  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '32px 22px 80px' }}>
      <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--color-accent-700)' }}>Live backend</div>
      <h1 style={{ margin: '2px 0 4px', fontSize: 32 }}>Auth &amp; Profile — real login → /me</h1>
      <p className="text-muted" style={{ fontSize: 13, margin: '0 0 18px' }}>
        Mode <strong style={{ color: 'var(--color-text)' }}>{AUTH_MODE}</strong> · API <code>{API_URL}</code>. Everything below is read from / written to the database.
      </p>

      {err && <div className="card" style={{ background: '#f7e2db', color: '#7a2d1a', marginBottom: 14 }}>⚠ {err}</div>}
      {note && <div className="card" style={{ background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)', marginBottom: 14 }}>✓ {note}</div>}

      {!token ? (
        <div className="card elev-sm" style={card}>
          <div className="card-kicker">Step 1 — Log in</div>
          {isCognito() ? (
            <>
              <p className="text-muted" style={{ fontSize: 13 }}>You&apos;ll be taken to the Cognito Hosted UI (email/password or Google) and returned with a real JWT.</p>
              <button className="sc-btn pri" onClick={() => { window.location.href = cognitoLoginUrl(); }}>Sign in with Cognito →</button>
            </>
          ) : (
            <>
              <p className="text-muted" style={{ fontSize: 13 }}>Dev login: mints a token the local dev server trusts (stands in for Cognito). Same email = same user row.</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: 1, minWidth: 200 }}><label>Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="field" style={{ flex: 1, minWidth: 200 }}><label>Name (optional)</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              </div>
              <button className="sc-btn pri" onClick={doDevLogin} disabled={busy}>{busy ? 'Signing in…' : 'Log in (dev)'}</button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="card elev-sm" style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-kicker">Your profile (from the database)</div>
              <button className="sc-btn ghost" onClick={doLogout}>Log out</button>
            </div>
            {profile ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
                <div><div style={lbl}>User ID</div><div style={{ fontSize: 13, wordBreak: 'break-all' }}>{profile.userId}</div></div>
                <div><div style={lbl}>Email</div><div style={{ fontSize: 13 }}>{profile.email || '—'}</div></div>
                <div><div style={lbl}>Role</div><div><span className="tag tag-accent">{profile.role}</span></div></div>
                <div><div style={lbl}>Name</div><div style={{ fontSize: 13 }}>{profile.name || '—'}</div></div>
                <div><div style={lbl}>Created</div><div style={{ fontSize: 13 }}>{new Date(profile.createdAt).toLocaleString()}</div></div>
                <div><div style={lbl}>Rank set?</div><div style={{ fontSize: 13 }}>{profile.rankPrefs ? `Adv ${profile.rankPrefs.advRank} · ${profile.rankPrefs.category}` : 'not yet'}</div></div>
              </div>
            ) : <p className="text-muted" style={{ fontSize: 13 }}>Loading…</p>}
          </div>

          <div className="card elev-sm" style={card}>
            <div className="card-kicker">Edit name (PATCH /me)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ flex: 1 }} placeholder="Your name" />
              <button className="sc-btn pri" onClick={saveName} disabled={busy}>Save</button>
            </div>
          </div>

          <div className="card elev-sm" style={card}>
            <div className="card-kicker">Rank &amp; preferences (PATCH /me/rank-prefs)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              <div className="field"><label>JEE Adv rank</label><input className="input" value={rp.advRank} onChange={(e) => setRp({ ...rp, advRank: e.target.value })} /></div>
              <div className="field"><label>JEE Main rank</label><input className="input" value={rp.mainRank} onChange={(e) => setRp({ ...rp, mainRank: e.target.value })} /></div>
              <div className="field"><label>Category</label><select className="input" value={rp.category} onChange={(e) => setRp({ ...rp, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="field"><label>Home state</label><input className="input" value={rp.home} onChange={(e) => setRp({ ...rp, home: e.target.value })} /></div>
              <div className="field"><label>Gender</label><select className="input" value={rp.gender} onChange={(e) => setRp({ ...rp, gender: e.target.value })}><option>Male</option><option>Female</option></select></div>
              <div className="field"><label>Priority</label><select className="input" value={rp.priority} onChange={(e) => setRp({ ...rp, priority: e.target.value })}><option value="branch">Branch first</option><option value="college">College first</option></select></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Branches (comma-separated)</label><input className="input" value={rp.branches} onChange={(e) => setRp({ ...rp, branches: e.target.value })} /></div>
            </div>
            <button className="sc-btn pri" onClick={saveRankPrefs} disabled={busy} style={{ alignSelf: 'flex-start' }}>Save rank &amp; prefs</button>
          </div>

          <div className="card elev-sm" style={{ ...card, background: 'var(--color-accent-100)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-kicker">Live predictor — Phase 2 (GET /predict)</div>
              <button className="sc-btn pri" onClick={runPredict} disabled={predBusy}>{predBusy ? 'Predicting…' : 'Predict my colleges'}</button>
            </div>
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Uses the rank inputs above. Computed by the <strong>catalog Lambda</strong> from the <strong>cloud DynamoDB</strong> dataset — the real backend, not dummy data.</p>
            {pred && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <span className="tag" style={bucketStyle('safe')}>Safe {pred.safeCount}</span>
                  <span className="tag" style={bucketStyle('target')}>Target {pred.targetCount}</span>
                  <span className="tag" style={bucketStyle('reach')}>Reach {pred.reachCount}</span>
                  <span className="tag tag-neutral">{pred.resultCount} matches · dataset v{pred.version}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {pred.results.slice(0, 8).map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'var(--color-bg)', borderRadius: 10, padding: '7px 10px' }}>
                      <span className="tag tag-neutral" style={{ padding: '1px 7px' }}>{c.type}</span>
                      <span style={{ fontFamily: 'var(--font-heading)', flex: 1 }}>{c.college} · {c.branch}</span>
                      {c.homeQuota && <span className="tag tag-accent-2" style={{ padding: '1px 7px' }}>🏠</span>}
                      <span className="tag" style={bucketStyle(c.bucket)}>{c.label} {c.pct}%</span>
                      <button className="sc-btn ghost" style={{ padding: '2px 8px' }} onClick={() => addToList(c.id)} disabled={choiceBusy}>{inList(c.id) ? '✓ Listed' : '＋ List'}</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card elev-sm" style={{ ...card, background: 'var(--color-accent-2-100)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-kicker">My choice list — Phase 3 (planner API)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="sc-btn ghost" onClick={loadChoice} disabled={choiceBusy}>{choiceBusy ? '…' : 'Refresh'}</button>
                <button className="sc-btn sec" onClick={doExport}>Export</button>
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Saved to the <strong>planner Lambda + DynamoDB</strong> (per-user, optimistic concurrency). Add from the predictor above; row order = your <strong>JoSAA priority</strong>. <strong>List Doctor</strong> is computed server-side.</p>
            {!choice || choice.items.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 0' }}>No choices yet — add some with <strong>＋ List</strong> from the predictor results above.</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <span className="tag" style={bucketStyle('safe')}>Safe {choice.summary.safe}</span>
                  <span className="tag" style={bucketStyle('target')}>Target {choice.summary.target}</span>
                  <span className="tag" style={bucketStyle('reach')}>Reach {choice.summary.reach}</span>
                  <span className="tag tag-neutral">{choice.summary.total} choices</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {choice.items.map((c, ix) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'var(--color-bg)', borderRadius: 10, padding: '7px 10px' }}>
                      <span className="tag tag-neutral" style={{ padding: '1px 7px' }}>{ix + 1}</span>
                      <span style={{ fontFamily: 'var(--font-heading)', flex: 1 }}>{c.college} · {c.branch}</span>
                      <span className="tag" style={bucketStyle(c.bucket)}>{c.label} {c.pct}%</span>
                      <button className="sc-btn ghost" style={{ padding: '2px 6px' }} onClick={() => moveChoice(ix, ix - 1)} disabled={ix === 0 || choiceBusy} title="Move up">↑</button>
                      <button className="sc-btn ghost" style={{ padding: '2px 6px' }} onClick={() => moveChoice(ix, ix + 1)} disabled={ix === choice.items.length - 1 || choiceBusy} title="Move down">↓</button>
                      <button className="sc-btn ghost" style={{ padding: '2px 6px' }} onClick={() => removeFromList(c.id)} disabled={choiceBusy} title="Remove">✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {choice.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 12.5, background: 'var(--color-surface)', borderRadius: 10, padding: '8px 10px', borderLeft: `3px solid ${sevColor(w.sev)}` }}>
                      <strong>{w.title}</strong> — <span className="text-muted">{w.detail}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card elev-sm" style={{ ...card, background: 'var(--color-accent-100)' }}>
            <div className="card-kicker">Mentors — Phase 4 (marketplace API)</div>

            {/* Become a mentor: apply → verify email (.ac.in OTP) → verify ID → review */}
            <div style={{ background: 'var(--color-bg)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, marginBottom: 6 }}>Become a mentor</div>
              {!mentor ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 }}>
                    <div className="field"><label>College</label><input className="input" value={mForm.college} onChange={(e) => setMForm({ ...mForm, college: e.target.value })} /></div>
                    <div className="field"><label>Branch</label><input className="input" value={mForm.branch} onChange={(e) => setMForm({ ...mForm, branch: e.target.value })} /></div>
                    <div className="field"><label>Year</label><input className="input" value={mForm.year} onChange={(e) => setMForm({ ...mForm, year: e.target.value })} /></div>
                    <div className="field"><label>Price ₹</label><input className="input" value={mForm.priceINR} onChange={(e) => setMForm({ ...mForm, priceINR: e.target.value })} /></div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}><label>Topics (comma-separated)</label><input className="input" value={mForm.topics} onChange={(e) => setMForm({ ...mForm, topics: e.target.value })} /></div>
                  </div>
                  <button className="sc-btn pri" onClick={applyMentor} disabled={mBusy} style={{ marginTop: 8 }}>Apply as mentor</button>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                    <span>{mentor.college} · {mentor.branch} · Year {mentor.year} · ₹{mentor.priceINR}</span>
                    <span className="tag" style={mentor.status === 'APPROVED' ? bucketStyle('safe') : mentor.status === 'PENDING_REVIEW' ? bucketStyle('target') : bucketStyle('reach')}>{mentor.status}</span>
                    <span className="tag tag-neutral">{mentor.emailVerified ? '✓ email' : 'email ✗'}</span>
                    <span className="tag tag-neutral">{mentor.idVerified ? '✓ ID' : 'ID ✗'}</span>
                  </div>
                  {mentor.status === 'DRAFT' && !mentor.emailVerified && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'flex-end' }}>
                      <div className="field" style={{ flex: 1, minWidth: 160 }}><label>College .ac.in email</label><input className="input" placeholder="you@iitb.ac.in" value={mForm.acEmail} onChange={(e) => setMForm({ ...mForm, acEmail: e.target.value })} /></div>
                      <button className="sc-btn sec" onClick={requestOtp} disabled={mBusy}>Send OTP</button>
                      <div className="field" style={{ width: 110 }}><label>OTP{mForm.devOtp ? ` (${mForm.devOtp})` : ''}</label><input className="input" value={mForm.otp} onChange={(e) => setMForm({ ...mForm, otp: e.target.value })} /></div>
                      <button className="sc-btn pri" onClick={confirmOtp} disabled={mBusy}>Verify</button>
                    </div>
                  )}
                  {mentor.status === 'DRAFT' && mentor.emailVerified && !mentor.idVerified && (
                    <button className="sc-btn pri" onClick={verifyIdStub} disabled={mBusy} style={{ marginTop: 8 }}>Verify student ID (stub)</button>
                  )}
                  {mentor.status === 'PENDING_REVIEW' && <p className="text-muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>⏳ Submitted — an admin will review your verification. (Admin console = Phase 7.)</p>}
                  {mentor.status === 'APPROVED' && <p style={{ fontSize: 13, margin: '8px 0 0' }}>🎉 You&apos;re a verified mentor — you now appear in the browse list below.</p>}
                </>
              )}
            </div>

            {/* Browse approved mentors (public GET /mentors) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>Browse mentors</div>
              <button className="sc-btn ghost" onClick={loadMentors} disabled={mBusy}>Refresh</button>
            </div>
            {!mentorList ? <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Loading…</p>
              : mentorList.length === 0 ? <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No approved mentors yet — apply above, then verify.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {mentorList.map((m) => (
                      <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'var(--color-bg)', borderRadius: 10, padding: '7px 10px' }}>
                        <span className="tag tag-accent-2" style={{ padding: '1px 7px' }}>✔</span>
                        <span style={{ fontFamily: 'var(--font-heading)', flex: 1 }}>{m.name} · {m.college}</span>
                        <span className="text-muted">{m.branch} · Y{m.year}</span>
                        <span>⭐ {m.ratingAvg?.toFixed?.(1) ?? m.ratingAvg}</span>
                        <span style={{ fontFamily: 'var(--font-heading)' }}>₹{m.priceINR}</span>
                        <button className="sc-btn ghost" style={{ padding: '2px 8px' }} onClick={() => bookMentor(m.userId)} disabled={sBusy} title="Books this mentor's slot 's1'">Book s1</button>
                      </div>
                    ))}
                  </div>
                )}
          </div>

          <div className="card elev-sm" style={{ ...card, background: 'var(--color-accent-2-100)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-kicker">My sessions — Phase 5 (booking saga)</div>
              <button className="sc-btn ghost" onClick={loadSessions} disabled={sBusy}>Refresh</button>
            </div>
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>The booking↔payment saga on the real backend. &quot;Pay (dev)&quot; stands in for the Razorpay webhook; join mints a (stub) video token. Slot picker + real Razorpay/video = owner TODO.</p>
            {!sessions ? <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Loading…</p>
              : sessions.length === 0 ? <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No sessions yet — book a mentor above (needs a mentor with an open slot &apos;s1&apos;).</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sessions.map((s) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'var(--color-bg)', borderRadius: 10, padding: '7px 10px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-heading)', flex: 1, minWidth: 120 }}>{s.mentorName || s.mentorId?.slice(0, 8)} · ₹{s.priceINR}</span>
                        <span className="tag" style={s.status === 'CONFIRMED' || s.status === 'LIVE' ? bucketStyle('safe') : s.status === 'PENDING_PAYMENT' ? bucketStyle('target') : bucketStyle('reach')}>{s.status}{s.rating ? ` · ⭐${s.rating}` : ''}</span>
                        {s.status === 'PENDING_PAYMENT' && <button className="sc-btn pri" style={{ padding: '2px 8px' }} onClick={() => sAction(liveApi.simulatePayment, s.id)} disabled={sBusy}>Pay (dev)</button>}
                        {(s.status === 'CONFIRMED' || s.status === 'LIVE') && <button className="sc-btn sec" style={{ padding: '2px 8px' }} onClick={() => sAction(liveApi.joinSession, s.id)} disabled={sBusy}>Join</button>}
                        {s.status === 'LIVE' && <button className="sc-btn ghost" style={{ padding: '2px 8px' }} onClick={() => sAction(liveApi.endSession, s.id)} disabled={sBusy}>End</button>}
                        {s.status === 'ENDED' && <button className="sc-btn pri" style={{ padding: '2px 8px' }} onClick={() => sAction(liveApi.rateSession, s.id, 5, 'Great!')} disabled={sBusy}>Rate ⭐5</button>}
                        {(s.status === 'PENDING_PAYMENT' || s.status === 'CONFIRMED') && <button className="sc-btn ghost" style={{ padding: '2px 8px' }} onClick={() => sAction(liveApi.cancelBooking, s.id)} disabled={sBusy}>Cancel</button>}
                      </div>
                    ))}
                  </div>
                )}
          </div>

          <div className="card elev-sm" style={card}>
            <div className="card-kicker">Switch role (POST /me/role)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="sc-btn sec" onClick={() => doSwitchRole('student')} disabled={busy}>Become student</button>
              <button className="sc-btn sec" onClick={() => doSwitchRole('mentor')} disabled={busy}>Become mentor</button>
            </div>
            {isCognito() && <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>In Cognito mode, the role change lands in your <code>custom:role</code> attribute — it appears in your next token (re-login to see it in the claims below).</p>}
          </div>

          <div className="card" style={{ background: 'var(--color-neutral-900)', color: '#fff' }}>
            <button className="sc-btn ghost" onClick={() => setShowRaw(!showRaw)} style={{ color: '#fff', alignSelf: 'flex-start', paddingLeft: 0 }}>{showRaw ? '▾' : '▸'} Raw token claims &amp; /me response</button>
            {showRaw && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div><div style={{ ...lbl, color: 'var(--color-neutral-400)' }}>Decoded token (not verified — display only)</div><pre style={{ margin: 0, fontSize: 12, overflowX: 'auto', color: '#a9e5c0' }}>{JSON.stringify(claims, null, 2)}</pre></div>
                <div><div style={{ ...lbl, color: 'var(--color-neutral-400)' }}>GET /me (from DynamoDB)</div><pre style={{ margin: 0, fontSize: 12, overflowX: 'auto', color: '#f6c99a' }}>{JSON.stringify(profile, null, 2)}</pre></div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
