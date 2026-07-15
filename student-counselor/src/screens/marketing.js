'use client';
// ══════════════════════════════════════════════════════════════════════════
// Public & Marketing pages (10 screens).
// ══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useApp } from '@/lib/store';
import { Btn, Tile, Tag, Avatar } from '@/components/ui';
import { MENTORS, PILLARS, JOURNEY, FEATURE_CARDS, GUIDES, TEAM, FAQS } from '@/lib/data';

// ── Landing / Home ────────────────────────────────────────────────────────
export function Landing() {
  const { profile, setProfile, navigate } = useApp();
  const featured = MENTORS.slice(0, 4);
  return (
    <section>
      <div className="hero" style={{ maxWidth: 1120, margin: '0 auto', padding: '56px 26px 40px', display: 'flex', gap: 44, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <Tag tone="accent-2" style={{ marginBottom: 16 }}>Based on official JoSAA opening &amp; closing ranks</Tag>
          <h1 style={{ fontSize: 60, lineHeight: 1.02, margin: '0 0 16px' }}>Cleared JEE?<br />Now pick the <span style={{ color: 'var(--color-accent-700)' }}>right</span> college.</h1>
          <p style={{ fontSize: 19, maxWidth: 520 }} className="text-muted">Predict the colleges your rank can get, plan your JoSAA choice list with drag-and-drop, and talk 1:1 to a verified current student before you decide.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 26 }}>
            <Btn variant="pri" go="predictor" style={{ padding: '15px 26px', fontSize: 16 }}>Predict my colleges (free)</Btn>
            <Btn variant="sec" go="marketplace" style={{ padding: '15px 26px', fontSize: 16 }}>Talk to a senior</Btn>
          </div>
          <div style={{ display: 'flex', gap: 26, marginTop: 30, flexWrap: 'wrap' }}>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>23 IITs</div><div className="text-muted" style={{ fontSize: 12 }}>31 NITs · 26 IIITs + GFTIs</div></div>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>40k+</div><div className="text-muted" style={{ fontSize: 12 }}>students guided</div></div>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>1,200+</div><div className="text-muted" style={{ fontSize: 12 }}>verified mentors</div></div>
          </div>
        </div>
        <div style={{ flex: 'none', width: 340, maxWidth: '100%' }}>
          <div className="card elev-lg" style={{ background: 'var(--color-surface)', padding: 22 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 19, marginBottom: 4 }}>Try it now</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>Enter your rank — see colleges in seconds.</p>
            <div className="field" style={{ marginBottom: 12 }}><label>JEE Advanced rank</label><input className="input" value={profile.advRank} onChange={(e) => setProfile({ advRank: +e.target.value || 0 })} /></div>
            <div className="field" style={{ marginBottom: 16 }}><label>Category</label>
              <select className="input" value={profile.category} onChange={(e) => setProfile({ category: e.target.value })}>
                <option>Open</option><option>OBC-NCL</option><option>SC</option><option>ST</option><option>EWS</option>
              </select>
            </div>
            <Btn variant="pri" go="predictor" block style={{ padding: 13 }}>See my colleges →</Btn>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--color-surface)', padding: '52px 26px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', marginBottom: 34 }}>Three things, done right</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
            {PILLARS.map((p) => (
              <div key={p.title} className="card elev-sm" style={{ background: 'var(--color-bg)', padding: 24 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--color-accent-100)', display: 'grid', placeItems: 'center', fontSize: 22, marginBottom: 8 }}>{p.icon}</div>
                <div className="card-title" style={{ fontSize: 22 }}>{p.title}</div>
                <p className="card-body" style={{ fontSize: 14 }}>{p.body}</p>
                <span className="sc-btn ghost" onClick={() => navigate(p.go)} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>{p.cta} →</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '52px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <h2 style={{ margin: 0 }}>Featured mentors</h2>
          <span className="sc-btn ghost" onClick={() => navigate('marketplace')}>Browse all →</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {featured.map((m) => (
            <Tile key={m.id} act="viewMentor" id={m.id} className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar initials={m.initials} color={m.color} />
                <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{m.name}</div><div className="text-muted" style={{ fontSize: 12 }}>{m.college} · Y{m.year}</div></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span>⭐ {m.rating} <span className="text-muted">({m.sessions})</span></span>
                <span style={{ fontFamily: 'var(--font-heading)' }}>₹{m.price}</span>
              </div>
            </Tile>
          ))}
        </div>
      </div>

      <footer style={{ background: 'var(--color-neutral-900)', color: 'var(--color-neutral-200)', padding: '44px 26px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 32, justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 280 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, color: '#fff', marginBottom: 8 }}>Student-Counselor</div><p style={{ fontSize: 13, opacity: .7 }}>Estimates from historical JoSAA data — not a guarantee. Always verify on josaa.nic.in.</p></div>
          <div style={{ display: 'flex', gap: 44, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', opacity: .5, marginBottom: 10 }}>Product</div><div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}><span className="sc-tile" onClick={() => navigate('features')} style={{ cursor: 'pointer' }}>Features</span><span className="sc-tile" onClick={() => navigate('pricing')} style={{ cursor: 'pointer' }}>Pricing</span><span className="sc-tile" onClick={() => navigate('becomeMentor')} style={{ cursor: 'pointer' }}>Become a mentor</span></div></div>
            <div><div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', opacity: .5, marginBottom: 10 }}>Company</div><div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}><span className="sc-tile" onClick={() => navigate('about')} style={{ cursor: 'pointer' }}>About</span><span className="sc-tile" onClick={() => navigate('faq')} style={{ cursor: 'pointer' }}>FAQ</span><span className="sc-tile" onClick={() => navigate('contact')} style={{ cursor: 'pointer' }}>Contact</span><span className="sc-tile" onClick={() => navigate('legal')} style={{ cursor: 'pointer' }}>Legal</span></div></div>
          </div>
        </div>
      </footer>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────
export function HowItWorks() {
  return (
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 44, margin: '0 0 8px' }}>How it works</h1>
      <p className="text-muted" style={{ fontSize: 17 }}>From your result to your final seat — and where we help at each step.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 20 }}>
        {JOURNEY.map((j) => (
          <div key={j.n} style={{ display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>{j.n}</span><span style={{ flex: 1, width: 2, background: 'var(--color-divider)' }} /></div>
            <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginBottom: 14, flex: 1 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{j.title}</div><p className="card-body" style={{ margin: 0 }}>{j.body}</p></div>
          </div>
        ))}
      </div>
      <Btn variant="pri" go="predictor" style={{ padding: '13px 24px', fontSize: 15 }}>Start now — it&apos;s free</Btn>
    </section>
  );
}

// ── Features ────────────────────────────────────────────────────────────────
export function Features() {
  return (
    <section style={{ maxWidth: 960, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 44, margin: '0 0 8px' }}>Everything you need to choose right</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 24 }}>
        {FEATURE_CARDS.map((f) => (
          <div key={f.title} className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--color-accent-100)', display: 'grid', placeItems: 'center', fontSize: 22 }}>{f.icon}</div><div className="card-title" style={{ fontSize: 20 }}>{f.title}</div><p className="card-body">{f.body}</p><Btn variant="ghost" go={f.go} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>See it →</Btn></div>
        ))}
      </div>
    </section>
  );
}

// ── Become a Mentor ───────────────────────────────────────────────────────
export function BecomeMentor() {
  return (
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '44px 24px 60px' }}>
      <Tag tone="accent-2" style={{ marginBottom: 12 }}>For current college students</Tag>
      <h1 style={{ fontSize: 46, margin: '0 0 8px' }}>Help juniors. Earn in your free time.</h1>
      <p className="text-muted" style={{ fontSize: 17 }}>Give honest 25-minute calls about your college and get paid ₹100 each — cash out to UPI anytime.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '22px 0' }}>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>₹100</div><div className="text-muted" style={{ fontSize: 12 }}>per 25-min call</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>₹80</div><div className="text-muted" style={{ fontSize: 12 }}>you keep (20% fee)</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>₹6k+</div><div className="text-muted" style={{ fontSize: 12 }}>top mentors / month</div></div>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>How verification works</div><ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.9 }}><li>Verify your college email (.ac.in) via OTP</li><li>Upload your student ID</li><li>Get approved in 24–48 hours</li><li>Set availability &amp; start earning</li></ol></div>
      <Btn variant="pri" go="mentorOnboarding" style={{ padding: '14px 26px', fontSize: 15, marginTop: 18 }}>Apply as a mentor →</Btn>
    </section>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────
export function Pricing() {
  return (
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 44, margin: '0 0 8px', textAlign: 'center' }}>Simple, honest pricing</h1>
      <p className="text-muted" style={{ fontSize: 17, textAlign: 'center', marginBottom: 24 }}>The whole planning toolkit is free. You only pay to talk to a senior.</p>
      <div className="price-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Free forever</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 34 }}>₹0</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.9 }}><li>College predictor</li><li>All filters &amp; search</li><li>Choice-list builder + List Doctor</li><li>Export &amp; print</li></ul><Btn variant="sec" go="predictor" block>Start free</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)', border: '2px solid var(--color-accent)' }}><div className="card-kicker">Pay per call</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 34 }}>₹100<span style={{ fontSize: 15, fontFamily: 'var(--font-body)' }}> / 25 min</span></div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.9 }}><li>1:1 video call with a verified senior</li><li>Pick any college&apos;s current student</li><li>Full refund if they no-show</li></ul><Btn variant="pri" go="marketplace" block>Browse mentors</Btn></div>
      </div>
      <p className="text-muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 16 }}>Refunds processed within 5–7 business days. No hidden charges.</p>
    </section>
  );
}

// ── Guides / Blog / Resources ─────────────────────────────────────────────
export function Guides() {
  return (
    <section style={{ maxWidth: 960, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 44, margin: '0 0 8px' }}>Guides &amp; resources</h1>
      <div className="field" style={{ maxWidth: 360 }}><input className="input" placeholder="Search guides…" /></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}><Tag tone="accent" style={{ cursor: 'pointer' }}>All</Tag><Tag style={{ cursor: 'pointer' }}>Branch guides</Tag><Tag style={{ cursor: 'pointer' }}>Cutoff trends</Tag><Tag style={{ cursor: 'pointer' }}>College reviews</Tag><Tag style={{ cursor: 'pointer' }}>How-tos</Tag></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {GUIDES.map((g) => (
          <Tile key={g.title} act="toast" msg="Opening article" className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">{g.cat}</div><div className="card-title">{g.title}</div><p className="card-body">{g.excerpt}</p><div className="card-meta">{g.read}</div></Tile>
        ))}
      </div>
    </section>
  );
}

// ── About / Team ──────────────────────────────────────────────────────────
export function About() {
  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 44, margin: '0 0 8px' }}>Built by people who&apos;ve been there</h1>
      <p className="text-muted" style={{ fontSize: 17 }}>We&apos;re a small team led by an IIT alum who remembers how confusing counselling felt. Our mission: make sure no student picks blind.</p>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 18 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>Why trust us</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.9 }}><li>Predictions built on official JoSAA data</li><li>Every mentor manually verified</li><li>Transparent, student-first pricing</li></ul></div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 18 }}>
        {TEAM.map((t) => (
          <div key={t.name} className="card elev-sm" style={{ background: 'var(--color-surface)', alignItems: 'center', textAlign: 'center', width: 150 }}><Avatar initials={t.i} color={t.color} size={56} /><div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div><div className="text-muted" style={{ fontSize: 12 }}>{t.role}</div></div>
        ))}
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────
export function Faq() {
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 44, margin: '0 0 8px' }}>Frequently asked</h1>
      <div className="field" style={{ maxWidth: 340 }}><input className="input" placeholder="Search questions…" /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {FAQS.map((f, i) => (
          <details key={i} className="card" style={{ background: 'var(--color-surface)' }}><summary style={{ fontFamily: 'var(--font-heading)', fontSize: 16, cursor: 'pointer' }}>{f.q}</summary><p style={{ fontSize: 14, margin: '8px 0 0' }} className="text-muted">{f.a}</p></details>
        ))}
      </div>
    </section>
  );
}

// ── Contact / Support ─────────────────────────────────────────────────────
export function Contact() {
  return (
    <section style={{ maxWidth: 560, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 40, margin: '0 0 8px' }}>Get in touch</h1>
      <p className="text-muted" style={{ fontSize: 16 }}>We reply within a few hours during counselling season.</p>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div className="field"><label>Your email</label><input className="input" placeholder="you@example.com" /></div><div className="field"><label>Message</label><textarea className="input" placeholder="How can we help?" /></div><Btn variant="pri" act="toast" msg="Message sent — we'll reply soon!" block>Send message</Btn></div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, fontSize: 14 }}><div>📧 help@studentcounselor.in</div><div>💬 WhatsApp: +91 90000 00000</div></div>
    </section>
  );
}

// ── Legal Pages ───────────────────────────────────────────────────────────
export function Legal() {
  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 40, margin: '0 0 8px' }}>Legal &amp; policies</h1>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}><Tag tone="accent" style={{ cursor: 'pointer' }}>Terms</Tag><Tag style={{ cursor: 'pointer' }}>Privacy</Tag><Tag style={{ cursor: 'pointer' }}>Refunds</Tag><Tag style={{ cursor: 'pointer' }}>Disclaimer</Tag><Tag style={{ cursor: 'pointer' }}>Guidelines</Tag></div>
      <div className="card" style={{ background: '#f7e2db' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>⚠ Prediction disclaimer</div><p style={{ fontSize: 14, margin: 0 }}>Predictions are estimates from historical data — <strong>not a guarantee</strong>. Always verify final cutoffs and fill your choices on the official josaa.nic.in portal.</p></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12, fontSize: 14, lineHeight: 1.7 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Terms of Use</div><p style={{ margin: 0 }} className="text-muted">By using Student-Counselor you agree to use predictions as guidance only, treat mentors respectfully, and follow our community &amp; session guidelines. Sessions are recorded for safety. Full terms available on request.</p></div>
    </section>
  );
}
