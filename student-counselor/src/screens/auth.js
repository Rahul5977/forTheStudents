'use client';
// ══════════════════════════════════════════════════════════════════════════
// Authentication & Onboarding (8 screens).
// ══════════════════════════════════════════════════════════════════════════
import { useApp } from '@/lib/store';
import { Btn, Tile, Field, Input, Select, SegOpt } from '@/components/ui';

const authWrap = { minHeight: '100%', display: 'grid', placeItems: 'center', padding: '40px 20px', background: 'var(--color-surface)' };
const cardStyle = { background: 'var(--color-bg)', width: 'min(420px, 100%)', padding: 30 };

// ── Sign Up ───────────────────────────────────────────────────────────────
export function Signup() {
  const { navigate } = useApp();
  return (
    <section style={authWrap}>
      <div className="card elev-lg" style={cardStyle}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, display: 'flex', alignItems: 'center', gap: 9, marginBottom: 2 }}><span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-grid', placeItems: 'center', color: 'var(--color-bg)', fontSize: 14 }}>S</span>Create your account</div>
        <p className="text-muted" style={{ fontSize: 14, marginBottom: 6 }}>Free to see your colleges — no card needed.</p>
        <Btn variant="sec" go="roleSelect" block style={{ gap: 10, padding: 12 }}><span style={{ fontSize: 16 }}>G</span> Continue with Google</Btn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}><div style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} /><span className="text-muted" style={{ fontSize: 12 }}>or</span><div style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} /></div>
        <Field label="Email or phone"><Input placeholder="you@example.com" /></Field>
        <Field label="Password"><Input type="password" placeholder="••••••••" /></Field>
        <label className="radio" style={{ fontSize: 12, margin: '8px 0' }}><input type="checkbox" /><span className="dot" />I agree to the Terms &amp; Privacy Policy</label>
        <Btn variant="pri" go="roleSelect" block style={{ padding: 12 }}>Create account</Btn>
        <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', margin: '12px 0 0' }}>🔒 We never share your data. Already have an account? <span className="sc-tile" onClick={() => navigate('login')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Log in</span></p>
      </div>
    </section>
  );
}

// ── Log In ──────────────────────────────────────────────────────────────────
export function Login() {
  const { navigate } = useApp();
  return (
    <section style={authWrap}>
      <div className="card elev-lg" style={cardStyle}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, marginBottom: 2 }}>Welcome back</div>
        <p className="text-muted" style={{ fontSize: 14, marginBottom: 6 }}>Log in to pick up where you left off.</p>
        <Btn variant="sec" go="dashboard" block style={{ gap: 10, padding: 12 }}><span style={{ fontSize: 16 }}>G</span> Continue with Google</Btn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}><div style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} /><span className="text-muted" style={{ fontSize: 12 }}>or</span><div style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} /></div>
        <Field label="Email or phone"><Input placeholder="you@example.com" /></Field>
        <Field label="Password"><Input type="password" placeholder="••••••••" /></Field>
        <div style={{ textAlign: 'right', marginBottom: 8 }}><span className="sc-tile" onClick={() => navigate('reset')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', fontSize: 12, display: 'inline' }}>Forgot password?</span></div>
        <Btn variant="pri" go="dashboard" block style={{ padding: 12 }}>Log in</Btn>
        <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', margin: '12px 0 0' }}>New here? <span className="sc-tile" onClick={() => navigate('signup')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Sign up</span></p>
      </div>
    </section>
  );
}

// ── OTP / Phone Verification ─────────────────────────────────────────────────
export function Otp() {
  const { navigate } = useApp();
  const preset = ['4', '8', '2', '', '', ''];
  return (
    <section style={authWrap}>
      <div className="card elev-lg" style={{ ...cardStyle, alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 34 }}>📱</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Verify your phone</div>
        <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>We sent a 6-digit code to <strong style={{ color: 'var(--color-text)' }}>+91 98••• ••210</strong></p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '8px 0' }}>
          {preset.map((v, i) => <input key={i} className="input" maxLength={1} defaultValue={v} style={{ width: 44, textAlign: 'center', fontSize: 20 }} />)}
        </div>
        <Btn variant="pri" go="onboarding" block style={{ padding: 12 }}>Verify</Btn>
        <div className="text-muted" style={{ fontSize: 12 }}>Resend code in 0:24 · <span className="sc-tile" onClick={() => navigate('signup')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Change number</span></div>
      </div>
    </section>
  );
}

// ── Forgot / Reset Password ──────────────────────────────────────────────────
export function Reset() {
  return (
    <section style={authWrap}>
      <div className="card elev-lg" style={cardStyle}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Reset your password</div>
        <p className="text-muted" style={{ fontSize: 14 }}>Enter your email or phone and we&apos;ll send a reset link.</p>
        <Field label="Email or phone"><Input placeholder="you@example.com" /></Field>
        <Btn variant="pri" act="confirm" dialog="resetSent" block style={{ padding: 12 }}>Send reset link</Btn>
        <Btn variant="ghost" go="login" block>← Back to log in</Btn>
      </div>
    </section>
  );
}

// ── Role Selection ────────────────────────────────────────────────────────────
export function RoleSelect() {
  const { navigate } = useApp();
  return (
    <section style={authWrap}>
      <div style={{ width: 'min(720px, 100%)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 4 }}>How will you use Student-Counselor?</h2>
        <p className="text-muted" style={{ textAlign: 'center', fontSize: 14, marginBottom: 20 }}>You can always switch later.</p>
        <div className="role-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="sc-tile card elev-sm" onClick={() => navigate('onboarding')} style={{ background: 'var(--color-bg)', padding: 26, alignItems: 'flex-start', cursor: 'pointer' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--color-accent-100)', display: 'grid', placeItems: 'center', fontSize: 24 }}>🎓</div>
            <div className="card-title" style={{ fontSize: 20 }}>I&apos;m a student</div>
            <p className="card-body">Find my colleges, plan my JoSAA choice list, and talk to seniors.</p>
            <span className="sc-btn pri">Get started →</span>
          </div>
          <div className="sc-tile card elev-sm" onClick={() => navigate('mentorOnboarding')} style={{ background: 'var(--color-bg)', padding: 26, alignItems: 'flex-start', cursor: 'pointer' }}>
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
export function Onboarding() {
  const { onbStep, profile, setProfile, runAct, navigate } = useApp();
  const step = Math.min(5, onbStep);
  const pct = (step / 5) * 100 + '%';
  const last = onbStep >= 5;
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
              <label className="radio"><input type="checkbox" /><span className="dot" />PwD status</label>
              <div className="seg"><SegOpt on>Male</SegOpt><SegOpt>Female</SegOpt></div>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><span className="tag tag-accent">Computer Science ✓</span><span className="tag tag-accent">Electronics ✓</span><span className="tag tag-neutral">Electrical</span><span className="tag tag-neutral">Mechanical</span><span className="tag tag-neutral">Civil</span></div>
            <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', margin: '14px 0 4px' }}>Priority</div>
            <div className="seg" style={{ width: '100%' }}><SegOpt on style={{ flex: 1, justifyContent: 'center' }}>Branch first</SegOpt><SegOpt style={{ flex: 1, justifyContent: 'center' }}>College first</SegOpt></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <Btn variant="sec" act="onbBack">← Back</Btn>
          {last
            ? <Btn variant="pri" go="predictor" style={{ flex: 1, padding: 12 }}>See my colleges →</Btn>
            : <Btn variant="pri" act="onbNext" style={{ flex: 1, padding: 12 }}>Next</Btn>}
        </div>
        <p className="text-muted" style={{ fontSize: 11, textAlign: 'center', margin: '12px 0 0' }}>You can edit all of this later from your profile.</p>
      </div>
    </section>
  );
}

// ── Mentor Onboarding / Application Wizard ───────────────────────────────────
export function MentorOnboarding() {
  return (
    <section style={{ minHeight: '100%', background: 'var(--color-surface)', padding: '32px 20px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Btn variant="ghost" go="roleSelect" style={{ paddingLeft: 0 }}>← Back</Btn>
        <h2 style={{ margin: '6px 0 2px' }}>Become a mentor</h2>
        <p className="text-muted" style={{ fontSize: 14 }}>Complete these to get verified. Fixed rate: <strong style={{ color: 'var(--color-text)' }}>₹100 / 25 min</strong> (platform fee 20%).</p>
        <div className="card" style={{ background: 'var(--color-bg)', marginTop: 8 }}><div className="card-kicker">Step 1</div><div className="card-title">College &amp; branch</div><Field label="College"><Input defaultValue="IIT Bombay" /></Field><div style={{ display: 'flex', gap: 10 }}><Field label="Branch" style={{ flex: 1 }}><Input defaultValue="Computer Science" /></Field><Field label="Year" style={{ width: 120 }}><Select defaultValue="3"><option>1</option><option>3</option><option>4</option></Select></Field></div></div>
        <div className="card" style={{ background: 'var(--color-bg)', marginTop: 14 }}><div className="card-kicker">Step 2 · Verification</div><div className="card-title">Prove you study there</div><Field label="College email (.ac.in)"><div style={{ display: 'flex', gap: 8 }}><Input defaultValue="21b0xxx@iitb.ac.in" style={{ flex: 1 }} /><Btn variant="sec" act="toast" msg="OTP sent to your college email">Send OTP</Btn></div></Field><Tile act="toast" msg="Student ID uploaded" style={{ border: '1.5px dashed var(--color-divider)', borderRadius: 16, padding: 18, textAlign: 'center' }}><div style={{ fontSize: 22 }}>🪪</div><div style={{ fontSize: 13 }}>Upload your student ID card</div></Tile></div>
        <div className="card" style={{ background: 'var(--color-bg)', marginTop: 14 }}><div className="card-kicker">Step 3 · Profile</div><div className="card-title">How students see you</div><Field label="Short bio"><textarea className="input" placeholder="Tell juniors what you can help with…" /></Field><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><span className="tag tag-accent">Branch choice ✓</span><span className="tag tag-accent">Placements ✓</span><span className="tag tag-neutral">Hostel</span><span className="tag tag-neutral">Campus life</span></div></div>
        <div className="card" style={{ background: 'var(--color-bg)', marginTop: 14 }}><div className="card-kicker">Step 4 · Payouts</div><div className="card-title">Where you get paid</div><Field label="UPI ID"><Input placeholder="name@upi" /></Field><p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Handled securely — we never store full bank details.</p></div>
        <Btn variant="pri" go="verifyStatus" block style={{ padding: 13, marginTop: 16 }}>Submit application</Btn>
      </div>
    </section>
  );
}

// ── Verification / Application Status ─────────────────────────────────────────
export function VerifyStatus() {
  return (
    <section style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: '40px 20px', background: 'var(--color-surface)' }}>
      <div className="card elev-lg" style={{ background: 'var(--color-bg)', width: 'min(480px, 100%)', padding: 32, alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--color-accent-100)', display: 'grid', placeItems: 'center', fontSize: 30 }}>⏳</div>
        <span className="tag tag-accent">Under review</span>
        <h2 style={{ margin: '2px 0' }}>Application submitted</h2>
        <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>We&apos;re checking your college email and student ID. Most applications are reviewed within <strong style={{ color: 'var(--color-text)' }}>24–48 hours</strong>.</p>
        <div style={{ width: '100%', textAlign: 'left', background: 'var(--color-surface)', borderRadius: 16, padding: 14, fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>✅ College email verified</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>✅ Student ID uploaded</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-neutral-600)' }}>⏳ Manual review in progress</div>
        </div>
        <Btn variant="pri" go="mDashboard" block>Go to mentor dashboard</Btn>
      </div>
    </section>
  );
}
