'use client';
// ══════════════════════════════════════════════════════════════════════════
// Authentication & Onboarding (8 screens) — WIRED to the live backend via the
// store's auth actions (doLogin / doSignup / doConfirm / switchRole /
// saveRankPrefs) and, for the mentor apply/status flow, liveApi directly.
// Visual design is unchanged: only data sources + submit handlers are wired.
// STATIC-EXPORT safe: every network call runs inside a handler or useEffect.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn, Tile, Field, Input, Select, SegOpt } from '@/components/ui';

const authWrap = { minHeight: '100%', display: 'grid', placeItems: 'center', padding: '40px 20px', background: 'var(--color-surface)' };
const cardStyle = { background: 'var(--color-bg)', width: 'min(420px, 100%)', padding: 30 };
const errStyle = { fontSize: 12.5, color: '#7a2d1a', background: '#f7e2db', borderRadius: 10, padding: '8px 10px', margin: '2px 0 8px' };

// ── Sign Up ───────────────────────────────────────────────────────────────
export function Signup() {
  const { navigate, doSignup, showToast } = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setErr(null);
    if (!email || !pw) { setErr('Enter your email and a password.'); return; }
    if (!agree) { setErr('Please accept the Terms & Privacy Policy.'); return; }
    setBusy(true);
    try {
      try { sessionStorage.setItem('sc_pending_email', email); } catch { /* SSR / private mode */ }
      // Dev pool auto-confirms → doSignup signs straight in; then land on onboarding.
      await doSignup(email, pw, email.split('@')[0] || 'Student');
      navigate('onboarding');
    } catch (e) {
      setErr(e?.message || 'Could not create your account. Try a different email.');
    } finally { setBusy(false); }
  };

  return (
    <section style={authWrap}>
      <div className="card elev-lg" style={cardStyle}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, display: 'flex', alignItems: 'center', gap: 9, marginBottom: 2 }}><span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-grid', placeItems: 'center', color: 'var(--color-bg)', fontSize: 14 }}>S</span>Create your account</div>
        <p className="text-muted" style={{ fontSize: 14, marginBottom: 6 }}>Free to see your colleges — no card needed.</p>
        {/* TODO(owner): wire Google (Cognito Hosted UI federated sign-in). */}
        <Btn variant="sec" onClick={() => showToast('Google sign-in is coming soon — use email for now.')} block style={{ gap: 10, padding: 12 }}><span style={{ fontSize: 16 }}>G</span> Continue with Google</Btn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}><div style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} /><span className="text-muted" style={{ fontSize: 12 }}>or</span><div style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} /></div>
        <Field label="Email"><Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
        <label className="radio" style={{ fontSize: 12, margin: '8px 0' }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span className="dot" />I agree to the Terms &amp; Privacy Policy</label>
        {err && <div style={errStyle}>{err}</div>}
        <Btn variant="pri" onClick={submit} disabled={busy} block style={{ padding: 12, opacity: busy ? 0.7 : 1 }}>{busy ? 'Creating account…' : 'Create account'}</Btn>
        <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', margin: '12px 0 0' }}>🔒 We never share your data. Already have an account? <span className="sc-tile" onClick={() => navigate('login')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Log in</span></p>
      </div>
    </section>
  );
}

// ── Log In ──────────────────────────────────────────────────────────────────
export function Login() {
  const { navigate, doLogin, showToast } = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setErr(null);
    if (!email || !pw) { setErr('Enter your email and password.'); return; }
    setBusy(true);
    try {
      await doLogin(email, pw); // navigates to dashboard on success
    } catch (e) {
      setErr(e?.message || 'Incorrect email or password.');
      setBusy(false);
    }
  };

  return (
    <section style={authWrap}>
      <div className="card elev-lg" style={cardStyle}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, marginBottom: 2 }}>Welcome back</div>
        <p className="text-muted" style={{ fontSize: 14, marginBottom: 6 }}>Log in to pick up where you left off.</p>
        {/* TODO(owner): wire Google (Cognito Hosted UI federated sign-in). */}
        <Btn variant="sec" onClick={() => showToast('Google sign-in is coming soon — use email for now.')} block style={{ gap: 10, padding: 12 }}><span style={{ fontSize: 16 }}>G</span> Continue with Google</Btn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}><div style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} /><span className="text-muted" style={{ fontSize: 12 }}>or</span><div style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} /></div>
        <Field label="Email"><Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
        <div style={{ textAlign: 'right', marginBottom: 8 }}><span className="sc-tile" onClick={() => navigate('reset')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', fontSize: 12, display: 'inline' }}>Forgot password?</span></div>
        {err && <div style={errStyle}>{err}</div>}
        <Btn variant="pri" onClick={submit} disabled={busy} block style={{ padding: 12, opacity: busy ? 0.7 : 1 }}>{busy ? 'Logging in…' : 'Log in'}</Btn>
        <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', margin: '12px 0 0' }}>New here? <span className="sc-tile" onClick={() => navigate('signup')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Sign up</span></p>
      </div>
    </section>
  );
}

// ── OTP / Email Confirmation ─────────────────────────────────────────────────
// The prototype styled this as phone verification; on the real backend it maps to
// Cognito email confirmation (doConfirm). In the dev pool sign-ups auto-confirm,
// so this is tolerant of an already-confirmed account.
export function Otp() {
  const { navigate, doConfirm, showToast } = useApp();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    try { setEmail(sessionStorage.getItem('sc_pending_email') || ''); } catch { /* ignore */ }
  }, []);

  const setDigit = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1);
    setCode((c) => { const n = [...c]; n[i] = d; return n; });
  };

  const submit = async () => {
    setErr(null);
    if (!email) {
      // No pending email in this tab (dev sign-ups are already confirmed) — proceed.
      showToast('Account already verified.');
      navigate('dashboard');
      return;
    }
    setBusy(true);
    try {
      await doConfirm(email, code.join('')); // tolerant of already-confirmed
      navigate('dashboard');
    } catch (e) {
      setErr(e?.message || 'That code didn’t work — check it and try again.');
    } finally { setBusy(false); }
  };

  return (
    <section style={authWrap}>
      <div className="card elev-lg" style={{ ...cardStyle, alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 34 }}>📱</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Verify your account</div>
        <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>We sent a 6-digit code to <strong style={{ color: 'var(--color-text)' }}>{email || 'your email'}</strong></p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '8px 0' }}>
          {code.map((v, i) => <input key={i} className="input" maxLength={1} inputMode="numeric" value={v} onChange={(e) => setDigit(i, e.target.value)} style={{ width: 44, textAlign: 'center', fontSize: 20 }} />)}
        </div>
        {err && <div style={{ ...errStyle, width: '100%' }}>{err}</div>}
        <Btn variant="pri" onClick={submit} disabled={busy} block style={{ padding: 12, opacity: busy ? 0.7 : 1 }}>{busy ? 'Verifying…' : 'Verify'}</Btn>
        <div className="text-muted" style={{ fontSize: 12 }}>Didn’t get it? · <span className="sc-tile" onClick={() => navigate('signup')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Change email</span></div>
      </div>
    </section>
  );
}

// ── Forgot / Reset Password ──────────────────────────────────────────────────
// Graceful placeholder: no Cognito forgot-password helper is exposed by auth.js.
export function Reset() {
  const { showToast } = useApp();
  const [email, setEmail] = useState('');
  // TODO(owner): wire Cognito forgotPassword / confirmForgotPassword when a helper
  // is added to src/lib/auth.js, then send the code + reset form from here.
  const submit = () => {
    showToast(email
      ? 'Password reset is coming soon — reach support to reset for now.'
      : 'Enter your email first.');
  };
  return (
    <section style={authWrap}>
      <div className="card elev-lg" style={cardStyle}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Reset your password</div>
        <p className="text-muted" style={{ fontSize: 14 }}>Enter your email or phone and we&apos;ll send a reset link.</p>
        <Field label="Email or phone"><Input placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Btn variant="pri" onClick={submit} block style={{ padding: 12 }}>Send reset link</Btn>
        <Btn variant="ghost" go="login" block>← Back to log in</Btn>
      </div>
    </section>
  );
}

// ── Role Selection ────────────────────────────────────────────────────────────
export function RoleSelect() {
  const { navigate, switchRole, loggedIn } = useApp();
  const choose = async (role) => {
    // Persist the role choice when we already have a session; otherwise it is set
    // during onboarding/mentor-apply. Navigate to the matching wizard either way.
    if (loggedIn) { try { await switchRole(role); } catch { /* toast handled in store */ } }
    navigate(role === 'mentor' ? 'mentorOnboarding' : 'onboarding');
  };
  return (
    <section style={authWrap}>
      <div style={{ width: 'min(720px, 100%)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 4 }}>How will you use Student-Counselor?</h2>
        <p className="text-muted" style={{ textAlign: 'center', fontSize: 14, marginBottom: 20 }}>You can always switch later.</p>
        <div className="role-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="sc-tile card elev-sm" onClick={() => choose('student')} style={{ background: 'var(--color-bg)', padding: 26, alignItems: 'flex-start', cursor: 'pointer' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--color-accent-100)', display: 'grid', placeItems: 'center', fontSize: 24 }}>🎓</div>
            <div className="card-title" style={{ fontSize: 20 }}>I&apos;m a student</div>
            <p className="card-body">Find my colleges, plan my JoSAA choice list, and talk to seniors.</p>
            <span className="sc-btn pri">Get started →</span>
          </div>
          <div className="sc-tile card elev-sm" onClick={() => choose('mentor')} style={{ background: 'var(--color-bg)', padding: 26, alignItems: 'flex-start', cursor: 'pointer' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--color-accent-2-100)', display: 'grid', placeItems: 'center', fontSize: 24 }}>🧑‍🏫</div>
            <div className="card-title" style={{ fontSize: 20 }}>I&apos;m a college student</div>
            <p className="card-body">Become a verified mentor — help juniors and earn in your free time.</p>
            <span className="sc-btn pri">Apply as mentor →</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Student Onboarding Wizard (multi-step) ───────────────────────────────────
const ONB_BRANCHES = ['Computer Science', 'Electronics', 'Electrical', 'Mechanical', 'Civil'];

export function Onboarding() {
  const { onbStep, profile, setProfile, saveRankPrefs, navigate } = useApp();
  const [saving, setSaving] = useState(false);
  const step = Math.min(5, onbStep);
  const pct = (step / 5) * 100 + '%';
  const last = onbStep >= 5;

  const branches = profile.branches || [];
  const toggleBranch = (b) => setProfile({ branches: branches.includes(b) ? branches.filter((x) => x !== b) : [...branches, b] });

  const finish = async () => {
    setSaving(true);
    try { await saveRankPrefs(profile); } catch { /* toast handled in store */ }
    setSaving(false);
    navigate('predictor'); // "See my colleges" → the live predictor, seeded with these prefs
  };

  return (
    <section style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: '36px 20px', background: 'var(--color-surface)' }}>
      <div className="card elev-lg" style={{ background: 'var(--color-bg)', width: 'min(520px, 100%)', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}><span className="text-muted" style={{ fontSize: 12 }}>Step {step} of 5</span><span className="sc-tile" onClick={() => navigate('predictor')} style={{ fontSize: 12, color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Skip</span></div>
        <div style={{ height: 6, background: 'var(--color-neutral-200)', borderRadius: 999, overflow: 'hidden', marginBottom: 18 }}><div style={{ height: '100%', background: 'var(--color-accent)', borderRadius: 999, width: pct, transition: 'width .3s' }} /></div>

        {step === 1 && (
          <div><h3 style={{ margin: '0 0 4px' }}>Which exam did you take?</h3><p className="text-muted" style={{ fontSize: 13 }}>We&apos;ll tailor predictions to it.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <label className="radio" style={{ border: '1px solid var(--color-divider)', borderRadius: 16, padding: 14 }}><input type="radio" name="exam" /><span className="dot" /><div><div style={{ fontWeight: 600 }}>JEE Main only</div><div className="text-muted" style={{ fontSize: 12 }}>NITs, IIITs, GFTIs</div></div></label>
              <label className="radio" style={{ border: '1px solid var(--color-divider)', borderRadius: 16, padding: 14 }}><input type="radio" name="exam" /><span className="dot" /><div><div style={{ fontWeight: 600 }}>JEE Advanced only</div><div className="text-muted" style={{ fontSize: 12 }}>IITs</div></div></label>
              <label className="radio" style={{ border: '1px solid var(--color-accent)', borderRadius: 16, padding: 14, background: 'var(--color-accent-100)' }}><input type="radio" name="exam" defaultChecked /><span className="dot" /><div><div style={{ fontWeight: 600 }}>Both Main &amp; Advanced</div><div className="text-muted" style={{ fontSize: 12 }}>All colleges — recommended</div></div></label>
            </div>
          </div>
        )}
        {step === 2 && (
          <div><h3 style={{ margin: '0 0 4px' }}>Your ranks</h3><p className="text-muted" style={{ fontSize: 13 }}>Find these on your JEE scorecard.</p>
            <Field label="JEE Advanced — category rank" style={{ marginTop: 8 }}><Input value={profile.advRank} onChange={(e) => setProfile({ advRank: +e.target.value || 0 })} /></Field>
            <Field label="JEE Main — category rank (CRL)"><Input value={profile.mainRank} onChange={(e) => setProfile({ mainRank: +e.target.value || 0 })} /></Field>
          </div>
        )}
        {step === 3 && (
          <div><h3 style={{ margin: '0 0 4px' }}>Category &amp; eligibility</h3><p className="text-muted" style={{ fontSize: 13 }}>Cutoffs differ by category and pool.</p>
            <Field label="Category" style={{ marginTop: 8 }}><Select value={profile.category} onChange={(e) => setProfile({ category: e.target.value })}><option>Open</option><option>OBC-NCL</option><option>SC</option><option>ST</option><option>EWS</option></Select></Field>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              <label className="radio"><input type="checkbox" checked={!!profile.pwd} onChange={(e) => setProfile({ pwd: e.target.checked })} /><span className="dot" />PwD status</label>
              <div className="seg"><SegOpt on={profile.gender !== 'Female'} onClick={() => setProfile({ gender: 'Male' })}>Male</SegOpt><SegOpt on={profile.gender === 'Female'} onClick={() => setProfile({ gender: 'Female' })}>Female</SegOpt></div>
            </div>
            <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Female applicants also see female-pool seats.</p>
          </div>
        )}
        {step === 4 && (
          <div><h3 style={{ margin: '0 0 4px' }}>Your home state</h3><p className="text-muted" style={{ fontSize: 13 }}>Needed for home-state quota at NITs &amp; GFTIs.</p>
            <Field label="Home state" style={{ marginTop: 8 }}><Select value={profile.home} onChange={(e) => setProfile({ home: e.target.value })}><option>Maharashtra</option><option>Tamil Nadu</option><option>Delhi</option><option>Uttar Pradesh</option><option>Karnataka</option><option>Telangana</option><option>West Bengal</option></Select></Field>
          </div>
        )}
        {step >= 5 && (
          <div><h3 style={{ margin: '0 0 4px' }}>What matters to you?</h3><p className="text-muted" style={{ fontSize: 13 }}>Helps us sort your results.</p>
            <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', margin: '8px 0 4px' }}>Interested branches</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ONB_BRANCHES.map((b) => {
                const on = branches.includes(b);
                return <span key={b} className={on ? 'tag tag-accent' : 'tag tag-neutral'} onClick={() => toggleBranch(b)} style={{ cursor: 'pointer' }}>{b}{on ? ' ✓' : ''}</span>;
              })}
            </div>
            <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', margin: '14px 0 4px' }}>Priority</div>
            <div className="seg" style={{ width: '100%' }}><SegOpt on={profile.priority !== 'college'} onClick={() => setProfile({ priority: 'branch' })} style={{ flex: 1, justifyContent: 'center' }}>Branch first</SegOpt><SegOpt on={profile.priority === 'college'} onClick={() => setProfile({ priority: 'college' })} style={{ flex: 1, justifyContent: 'center' }}>College first</SegOpt></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <Btn variant="sec" act="onbBack">← Back</Btn>
          {last
            ? <Btn variant="pri" onClick={finish} disabled={saving} style={{ flex: 1, padding: 12, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'See my colleges →'}</Btn>
            : <Btn variant="pri" act="onbNext" style={{ flex: 1, padding: 12 }}>Next</Btn>}
        </div>
        <p className="text-muted" style={{ fontSize: 11, textAlign: 'center', margin: '12px 0 0' }}>You can edit all of this later from your profile.</p>
      </div>
    </section>
  );
}

// ── Mentor Onboarding / Application Wizard ───────────────────────────────────
const MENTOR_TOPICS = ['Branch choice', 'Placements', 'Hostel', 'Campus life'];

export function MentorOnboarding() {
  const { navigate, profile, showToast } = useApp();
  const [form, setForm] = useState({ college: 'IIT Bombay', branch: 'Computer Science', year: '3', bio: '', topics: ['Branch choice', 'Placements'], upi: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleTopic = (t) => setForm((f) => ({ ...f, topics: f.topics.includes(t) ? f.topics.filter((x) => x !== t) : [...f.topics, t] }));

  const submit = async () => {
    setErr(null);
    if (!form.college || !form.branch) { setErr('Add your college and branch.'); return; }
    setBusy(true);
    try {
      await liveApi.mentorApply({
        name: profile?.name || 'Mentor',
        college: form.college,
        branch: form.branch,
        year: Number(form.year) || 1,
        priceINR: 100, // fixed platform rate
        topics: form.topics,
        bio: form.bio,
      });
      navigate('verifyStatus');
    } catch (e) {
      setErr(e?.message || 'Could not submit your application. Are you signed in?');
    } finally { setBusy(false); }
  };

  return (
    <section style={{ minHeight: '100%', background: 'var(--color-surface)', padding: '32px 20px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Btn variant="ghost" go="roleSelect" style={{ paddingLeft: 0 }}>← Back</Btn>
        <h2 style={{ margin: '6px 0 2px' }}>Become a mentor</h2>
        <p className="text-muted" style={{ fontSize: 14 }}>Complete these to get verified. Fixed rate: <strong style={{ color: 'var(--color-text)' }}>₹100 / 25 min</strong> (platform fee 20%).</p>
        <div className="card" style={{ background: 'var(--color-bg)', marginTop: 8 }}><div className="card-kicker">Step 1</div><div className="card-title">College &amp; branch</div><Field label="College"><Input value={form.college} onChange={(e) => set({ college: e.target.value })} /></Field><div style={{ display: 'flex', gap: 10 }}><Field label="Branch" style={{ flex: 1 }}><Input value={form.branch} onChange={(e) => set({ branch: e.target.value })} /></Field><Field label="Year" style={{ width: 120 }}><Select value={form.year} onChange={(e) => set({ year: e.target.value })}><option>1</option><option>3</option><option>4</option></Select></Field></div></div>
        {/* Step 2 — email OTP + ID: the real .ac.in OTP + ID checks run on the verification screen after applying. */}
        <div className="card" style={{ background: 'var(--color-bg)', marginTop: 14 }}><div className="card-kicker">Step 2 · Verification</div><div className="card-title">Prove you study there</div><Field label="College email (.ac.in)"><div style={{ display: 'flex', gap: 8 }}><Input defaultValue="21b0xxx@iitb.ac.in" style={{ flex: 1 }} /><Btn variant="sec" onClick={() => showToast('You’ll verify your college email right after you submit.')}>Send OTP</Btn></div></Field><Tile onClick={() => showToast('Student ID upload happens on the next step.')} style={{ border: '1.5px dashed var(--color-divider)', borderRadius: 16, padding: 18, textAlign: 'center' }}><div style={{ fontSize: 22 }}>🪪</div><div style={{ fontSize: 13 }}>Upload your student ID card</div></Tile></div>
        <div className="card" style={{ background: 'var(--color-bg)', marginTop: 14 }}><div className="card-kicker">Step 3 · Profile</div><div className="card-title">How students see you</div><Field label="Short bio"><textarea className="input" placeholder="Tell juniors what you can help with…" value={form.bio} onChange={(e) => set({ bio: e.target.value })} /></Field><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{MENTOR_TOPICS.map((t) => { const on = form.topics.includes(t); return <span key={t} className={on ? 'tag tag-accent' : 'tag tag-neutral'} onClick={() => toggleTopic(t)} style={{ cursor: 'pointer' }}>{t}{on ? ' ✓' : ''}</span>; })}</div></div>
        <div className="card" style={{ background: 'var(--color-bg)', marginTop: 14 }}><div className="card-kicker">Step 4 · Payouts</div><div className="card-title">Where you get paid</div><Field label="UPI ID"><Input placeholder="name@upi" value={form.upi} onChange={(e) => set({ upi: e.target.value })} /></Field><p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Handled securely — we never store full bank details.</p></div>
        {err && <div style={{ ...errStyle, marginTop: 14 }}>{err}</div>}
        <Btn variant="pri" onClick={submit} disabled={busy} block style={{ padding: 13, marginTop: 16, opacity: busy ? 0.7 : 1 }}>{busy ? 'Submitting…' : 'Submit application'}</Btn>
      </div>
    </section>
  );
}

// ── Verification / Application Status ─────────────────────────────────────────
export function VerifyStatus() {
  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let on = true;
    liveApi.mentorProfile()
      .then((m) => { if (on) setMentor(m); })
      .catch(() => { if (on) setMentor(null); }) // 404 = no application yet
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  const status = mentor?.status;
  const approved = status === 'APPROVED';
  const statusLabel = loading ? 'Checking…' : approved ? 'Approved' : status === 'PENDING_REVIEW' ? 'Under review' : status === 'DRAFT' ? 'Finish verification' : 'Under review';
  const check = (done, pending, text) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: done ? undefined : 'var(--color-neutral-600)' }}>{done ? '✅' : pending ? '⏳' : '⬜'} {text}</div>
  );

  return (
    <section style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: '40px 20px', background: 'var(--color-surface)' }}>
      <div className="card elev-lg" style={{ background: 'var(--color-bg)', width: 'min(480px, 100%)', padding: 32, alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: approved ? 'var(--color-accent-2-100)' : 'var(--color-accent-100)', display: 'grid', placeItems: 'center', fontSize: 30 }}>{approved ? '🎉' : '⏳'}</div>
        <span className={approved ? 'tag tag-accent-2' : 'tag tag-accent'}>{statusLabel}</span>
        <h2 style={{ margin: '2px 0' }}>{loading ? 'Loading your application…' : mentor ? (approved ? 'You’re verified!' : 'Application submitted') : 'No application yet'}</h2>
        {mentor ? (
          <>
            <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>{approved
              ? 'You now appear in the mentor marketplace. Head to your dashboard to set availability.'
              : <>We&apos;re checking your college email and student ID. Most applications are reviewed within <strong style={{ color: 'var(--color-text)' }}>24–48 hours</strong>.</>}</p>
            <div style={{ width: '100%', textAlign: 'left', background: 'var(--color-surface)', borderRadius: 16, padding: 14, fontSize: 13 }}>
              {check(!!mentor.emailVerified, !mentor.emailVerified, 'College email verified')}
              {check(!!mentor.idVerified, !mentor.idVerified, 'Student ID verified')}
              {check(approved, !approved, approved ? 'Approved by our team' : 'Manual review in progress')}
            </div>
          </>
        ) : !loading ? (
          <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>We couldn&apos;t find an application on your account. Start your mentor application to get verified.</p>
        ) : (
          <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>One moment…</p>
        )}
        {mentor
          ? <Btn variant="pri" go="mDashboard" block>Go to mentor dashboard</Btn>
          : !loading && <Btn variant="pri" go="mentorOnboarding" block>Start mentor application</Btn>}
      </div>
    </section>
  );
}
