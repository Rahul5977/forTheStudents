'use client';
// ══════════════════════════════════════════════════════════════════════════
// Student app — the core experience (22 screens).
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { Btn, Tile, Tag, ChanceChip, TypeBadge, Avatar, Field, Input, Select, SegOpt } from '@/components/ui';
import { results as computeResults, byId, decorate, listDoctor, chartData, chipStyle, typeStyle } from '@/lib/logic';
import { COLLEGES, MENTORS, ROUNDS, NOTIFS, FAQS, SETTING_GROUPS, TXNS, SLOT_LIST, SESSION_MAP } from '@/lib/data';
import { API_URL, PREDICTOR_API } from '@/lib/liveConfig';

const REACH_BG = '#f7e2db';
const REACH_FG = '#7a2d1a';

// Small helpers used across student screens.
function useResults() {
  const { profile, filters } = useApp();
  return computeResults(profile, filters);
}
function fmtTime(t) {
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

// ── Dashboard / Home ───────────────────────────────────────────────────────
export function Dashboard() {
  const { navigate, profile, choiceList } = useApp();
  const res = useResults();
  const safe = res.filter((r) => r.bucket === 'safe').length;
  const target = res.filter((r) => r.bucket === 'target').length;
  const reach = res.filter((r) => r.bucket === 'reach').length;
  const choiceItems = choiceList.map((id) => byId(id, profile));
  const clSafe = choiceItems.filter((c) => c.bucket === 'safe').length;
  return (
    <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 32 }}>Hi Aditya 👋</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 18 }}>JoSAA Round 2 choice-filling closes in <strong style={{ color: 'var(--color-accent-700)' }}>3 days</strong>. Let&apos;s keep your list sharp.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
        <Tile go="predictor" className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
          <div className="card-kicker">Your colleges at a glance</div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, color: 'var(--color-accent-2-800)' }}>{safe}</div><div style={{ fontSize: 11 }}>Safe</div></div>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, color: 'var(--color-accent-800)' }}>{target}</div><div style={{ fontSize: 11 }}>Target</div></div>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, color: REACH_FG }}>{reach}</div><div style={{ fontSize: 11 }}>Reach</div></div>
          </div>
          <span className="sc-btn ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>Open predictor →</span>
        </Tile>
        <Tile go="choiceBuilder" className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
          <div className="card-kicker">My choice list · {choiceItems.length} choices</div>
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            <div>1. IIT Indore — CSE</div><div>2. IIT (BHU) — CSE</div><div>3. IIT Guwahati — CSE</div>
          </div>
          <span className="sc-btn ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>Open builder →</span>
        </Tile>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}>
          <div className="card-kicker">Upcoming session</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar initials="AS" size={40} />
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>Aarav Sharma</div><div className="text-muted" style={{ fontSize: 12 }}>Today · 6:30 PM · 25 min</div></div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}><Btn variant="pri" go="sessionRoom">Join</Btn><Btn variant="sec" go="sessions">Reschedule</Btn></div>
        </div>
      </div>

      <div className="dash-2col" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 14 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>Smart nudges</div><Tag tone="accent-2">Personalised</Tag></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: REACH_BG, borderRadius: 12, padding: '11px 13px' }}><span>⚠</span><div style={{ fontSize: 13 }}><strong>Add more Safe colleges.</strong> You have {clSafe} in your list — aim for 3–4 so you&apos;re never unallotted. <span className="sc-tile" onClick={() => navigate('predictor')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Find some →</span></div></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--color-accent-2-100)', borderRadius: 12, padding: '11px 13px' }}><span>📢</span><div style={{ fontSize: 13 }}><strong>Round 2 results are out.</strong> Review your allotment and decide Freeze / Float / Slide. <span className="sc-tile" onClick={() => navigate('timeline')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Open timeline →</span></div></div>
          </div>
        </div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>Counselling timeline</div>
          <div style={{ fontSize: 13 }}><div style={{ color: 'var(--color-accent-700)', fontWeight: 700 }}>Round 2 · closes Jul 16</div><div className="text-muted">Choice filling open now</div></div>
          <div style={{ fontSize: 13, marginTop: 6 }}><div>Round 3 · Jul 22</div><div className="text-muted">Seat allotment</div></div>
          <Btn variant="sec" go="timeline" block>View all rounds</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <Btn variant="sec" go="predictor">🎯 Predictor</Btn>
        <Btn variant="sec" go="choiceBuilder">📋 Choice list</Btn>
        <Btn variant="sec" go="marketplace">💬 Talk to a senior</Btn>
        <Btn variant="sec" go="filters">🔍 College search</Btn>
      </div>
    </section>
  );
}

// ── Profile — Rank & Preferences ─────────────────────────────────────────────
export function Profile() {
  const { profile, setProfile } = useApp();
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Rank &amp; preferences</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 16 }}>These power your predictions — change them and your colleges update instantly.</p>
      <div className="card" style={{ background: 'var(--color-surface)' }}>
        <div className="card-kicker">Your ranks</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="JEE Advanced rank" style={{ flex: 1, minWidth: 160 }}><Input value={profile.advRank} onChange={(e) => setProfile({ advRank: +e.target.value || 0 })} /></Field>
          <Field label="JEE Main rank" style={{ flex: 1, minWidth: 160 }}><Input value={profile.mainRank} onChange={(e) => setProfile({ mainRank: +e.target.value || 0 })} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Category" style={{ flex: 1, minWidth: 160 }}><Select value={profile.category} onChange={(e) => setProfile({ category: e.target.value })}><option>Open</option><option>OBC-NCL</option><option>SC</option><option>ST</option><option>EWS</option></Select></Field>
          <Field label="Home state" style={{ flex: 1, minWidth: 160 }}><Select value={profile.home} onChange={(e) => setProfile({ home: e.target.value })}><option>Maharashtra</option><option>Tamil Nadu</option><option>Delhi</option><option>Uttar Pradesh</option><option>Karnataka</option><option>Telangana</option><option>West Bengal</option></Select></Field>
        </div>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
        <div className="card-kicker">Preferences</div>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Interested branches</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><Tag tone="accent">Computer Science ✓</Tag><Tag tone="accent">Electronics ✓</Tag><Tag>Electrical</Tag><Tag>Mechanical</Tag></div>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginTop: 8 }}>Priority</div>
        <div className="seg"><SegOpt on>Branch first</SegOpt><SegOpt>College first</SegOpt></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}><Btn variant="pri" go="predictor">Save &amp; see updated colleges</Btn><Btn variant="sec" go="dashboard">Cancel</Btn></div>
    </section>
  );
}

// ── College Predictor — Results [CORE] ───────────────────────────────────────
export function Predictor() {
  const { profile, filters, setFilters, toggleType } = useApp();
  const localRes = useResults();
  const [apiRes, setApiRes] = useState(null);
  const [apiBusy, setApiBusy] = useState(false);

  // In API mode, fetch REAL results from the catalog service whenever inputs change.
  useEffect(() => {
    if (!PREDICTOR_API) return;
    let cancelled = false;
    setApiBusy(true);
    const params = new URLSearchParams({
      advRank: String(profile.advRank), mainRank: String(profile.mainRank), category: profile.category,
      types: filters.types.join(','), q: filters.q || '',
      sort: filters.sort === 'ranking' ? 'closing' : filters.sort, // API has no NIRF
    });
    fetch(`${API_URL}/predict?${params}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setApiRes(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setApiBusy(false); });
    return () => { cancelled = true; };
  }, [profile.advRank, profile.mainRank, profile.category, filters.types, filters.q, filters.sort]);

  const live = PREDICTOR_API && !!apiRes;
  const res = live ? apiRes.results : localRes;
  const safe = live ? apiRes.safeCount : localRes.filter((r) => r.bucket === 'safe').length;
  const target = live ? apiRes.targetCount : localRes.filter((r) => r.bucket === 'target').length;
  const reach = live ? apiRes.reachCount : localRes.filter((r) => r.bucket === 'reach').length;
  const count = live ? apiRes.resultCount : localRes.length;
  const TYPES = ['IIT', 'NIT', 'IIIT', 'GFTI'];
  return (
    <section style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 22px 40px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-accent-700)' }}>Core screen</div>
          <h1 style={{ margin: 0, fontSize: 34 }}>Your colleges</h1>
        </div>
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 16, background: 'var(--color-surface)', padding: '10px 18px' }}>
          <div><div className="text-muted" style={{ fontSize: 11 }}>JEE Adv rank</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{profile.advRank}</div></div>
          <div style={{ width: 1, height: 30, background: 'var(--color-divider)' }} />
          <div><div className="text-muted" style={{ fontSize: 11 }}>JEE Main rank</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{profile.mainRank}</div></div>
          <div style={{ width: 1, height: 30, background: 'var(--color-divider)' }} />
          <div><div className="text-muted" style={{ fontSize: 11 }}>Category</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{profile.category}</div></div>
          <Btn variant="ghost" go="profile">Edit rank</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 150, background: 'var(--color-accent-2-100)', borderRadius: 16, padding: '14px 18px' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, color: 'var(--color-accent-2-800)' }}>{safe}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#728157' }} />Safe — very likely</div></div>
        <div style={{ flex: 1, minWidth: 150, background: 'var(--color-accent-100)', borderRadius: 16, padding: '14px 18px' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, color: 'var(--color-accent-800)' }}>{target}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d67f48' }} />Target — realistic</div></div>
        <div style={{ flex: 1, minWidth: 150, background: REACH_BG, borderRadius: 16, padding: '14px 18px' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, color: REACH_FG }}>{reach}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#a8442e' }} />Reach — ambitious</div></div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <aside className="predictor-aside" style={{ flex: 'none', width: 250, position: 'sticky', top: 76 }}>
          <div className="card" style={{ background: 'var(--color-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Filters</div><Btn variant="ghost" go="filters" style={{ fontSize: 12 }}>All →</Btn></div>
            <Field label="Search college or branch"><Input placeholder="e.g. IIT Bombay" value={filters.q} onChange={(e) => setFilters({ q: e.target.value })} /></Field>
            <div>
              <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginBottom: 6 }}>College type</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TYPES.map((t) => (
                  <span key={t} className="tag" onClick={() => toggleType(t)} style={{ cursor: 'pointer', ...(filters.types.includes(t) ? { background: 'var(--color-accent)', color: 'var(--color-bg)' } : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }) }}>{t}</span>
                ))}
              </div>
            </div>
            <Field label="Branch"><Select value={filters.branch} onChange={(e) => setFilters({ branch: e.target.value })}><option value="all">All branches</option><option>Computer Science</option><option>Electronics</option><option>Electrical</option><option>Mechanical</option></Select></Field>
            <Field label="State"><Select value={filters.state} onChange={(e) => setFilters({ state: e.target.value })}><option value="all">All states</option><option>Maharashtra</option><option>Tamil Nadu</option><option>Delhi</option><option>Telangana</option><option>Uttar Pradesh</option><option>Karnataka</option></Select></Field>
            <div style={{ fontSize: 12, background: 'var(--color-accent-2-100)', borderRadius: 12, padding: '9px 11px', color: 'var(--color-accent-2-800)' }}>🏠 Home-state quota applied for <strong>{profile.home}</strong> NITs &amp; GFTIs.</div>
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14 }}>
              <strong>{count}</strong> <span className="text-muted">options match your rank &amp; filters</span>
              {live && <span className="tag tag-accent-2" style={{ marginLeft: 8, padding: '1px 8px' }}>● Live · official JoSAA {apiRes.version.replace('josaa-', '')}</span>}
              {PREDICTOR_API && apiBusy && <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>updating…</span>}
            </div>
            <div className="field" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><label style={{ margin: 0 }}>Sort</label><Select style={{ width: 'auto' }} value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value })}><option value="chance">By chance</option><option value="ranking">By NIRF ranking</option><option value="closing">By closing rank</option><option value="location">By location</option></Select></div>
          </div>

          {res.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {res.map((c) => (
                <div key={c.id} className="card elev-sm" style={{ background: 'var(--color-surface)', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <TypeBadge type={c.type} />
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{c.college}</span>
                        {c.homeQuota && <Tag tone="accent-2">🏠 Home state</Tag>}
                      </div>
                      <div className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>{live ? `${c.branch} · ${c.type} · ${c.quota === 'AI' ? 'All-India' : c.quota} quota` : `${c.branch} · ${c.city}, ${c.state} · NIRF #${c.nirf}`}</div>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <ChanceChip bucket={c.bucket} label={c.label} pct={c.pct} withDot />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 22, fontSize: 13, flexWrap: 'wrap' }}>
                    {live ? (
                      <>
                        <div><span className="text-muted">Closing rank ({c.examLabel})</span> <strong>{c.close}</strong></div>
                        <div><span className="text-muted">Opening rank</span> <strong>{c.open}</strong></div>
                        <div><span className="text-muted">Seat</span> <strong>{c.seatType}</strong></div>
                      </>
                    ) : (
                      <>
                        <div><span className="text-muted">Last {c.examLabel} close</span> <strong>{c.close}</strong></div>
                        <div><span className="text-muted">Avg package</span> <strong>{c.avgTxt}</strong></div>
                        <div><span className="text-muted">Fees</span> <strong>{c.feesTxt}</strong></div>
                      </>
                    )}
                  </div>
                  {live ? (
                    <div className="text-muted" style={{ fontSize: 12, borderTop: '1px solid var(--color-divider)', paddingTop: 8 }}>Official JoSAA 2024 cutoff · add-to-list &amp; 1:1 talk arrive with Phase 3/4</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--color-divider)', paddingTop: 10 }}>
                      <Btn variant="pri" act="addList" id={c.id}>+ Add to list</Btn>
                      <Btn variant="sec" act="viewDetail" id={c.id}>View analysis</Btn>
                      <Btn variant="sec" act="talkHere" id={c.id}>💬 Talk to a student here</Btn>
                      <Btn variant="ghost" act="shortlist" id={c.id} style={{ marginLeft: 'auto' }}>♡ Save</Btn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: '44px 20px', background: 'var(--color-surface)' }}>
              <div style={{ fontSize: 40 }}>🔍</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>No colleges match these filters</div>
              <p className="text-muted" style={{ fontSize: 14, maxWidth: 340 }}>Try loosening a filter — remove a college type, widen the branch, or clear the search.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Advanced Filters / Search ────────────────────────────────────────────────
export function Filters() {
  const { filters, setFilters, toggleType, runAct } = useApp();
  const TYPES = ['IIT', 'NIT', 'IIIT', 'GFTI'];
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Advanced filters &amp; search</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>Narrow across every dimension, then apply.</p>
      <div className="card" style={{ background: 'var(--color-surface)' }}>
        <Field label="Search college or branch"><Input placeholder="e.g. NIT Trichy CSE" value={filters.q} onChange={(e) => setFilters({ q: e.target.value })} /></Field>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>College type</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TYPES.map((t) => (
            <span key={t} className="tag" onClick={() => toggleType(t)} style={{ cursor: 'pointer', ...(filters.types.includes(t) ? { background: 'var(--color-accent)', color: 'var(--color-bg)' } : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }) }}>{t}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Branch" style={{ flex: 1, minWidth: 150 }}><Select value={filters.branch} onChange={(e) => setFilters({ branch: e.target.value })}><option value="all">All branches</option><option>Computer Science</option><option>Electronics</option><option>Electrical</option><option>Mechanical</option></Select></Field>
          <Field label="State" style={{ flex: 1, minWidth: 150 }}><Select value={filters.state} onChange={(e) => setFilters({ state: e.target.value })}><option value="all">All states</option><option>Maharashtra</option><option>Tamil Nadu</option><option>Delhi</option><option>Telangana</option><option>Uttar Pradesh</option><option>Karnataka</option></Select></Field>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Max fees" style={{ flex: 1, minWidth: 150 }}><Select><option>Any</option><option>Under ₹2L</option><option>Under ₹5L</option></Select></Field>
          <Field label="NIRF ranking" style={{ flex: 1, minWidth: 150 }}><Select><option>Any</option><option>Top 10</option><option>Top 25</option></Select></Field>
        </div>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Saved presets</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Tag tone="outline" style={{ cursor: 'pointer' }}>CSE only</Tag><Tag tone="outline" style={{ cursor: 'pointer' }}>Home-state NITs</Tag><Tag tone="outline" style={{ cursor: 'pointer' }}>Top 10 NIRF</Tag></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}><Btn variant="pri" go="predictor" style={{ flex: 1 }}>Apply filters</Btn><Btn variant="sec" act="toast" msg="Filters reset">Reset</Btn></div>
      </div>
    </section>
  );
}

// ── College Detail & Analysis [CORE] ─────────────────────────────────────────
export function CollegeDetail() {
  const { profile, selected } = useApp();
  const c = byId(selected, profile);
  const chart = chartData(c, profile);
  return (
    <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 22px 96px' }}>
      <Btn variant="ghost" go="predictor" style={{ paddingLeft: 0, marginBottom: 6 }}>← Back to predictor</Btn>
      <div className="card elev-sm" style={{ background: 'var(--color-surface)', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><TypeBadge type={c.type} /><span className="tag" style={chipStyle(c.bucket)}>{c.label} · {c.pct}% for you</span></div>
            <h1 style={{ margin: '8px 0 2px', fontSize: 34 }}>{c.college}</h1>
            <div className="text-muted" style={{ fontSize: 14 }}>{c.branch} · {c.city}, {c.state} · NIRF #{c.nirf} · Est. {c.estd}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="pri" act="addList" id={c.id}>+ Add to list</Btn>
            <Btn variant="sec" act="talkHere" id={c.id}>💬 Talk to a student</Btn>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ background: 'var(--color-surface)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Cutoff trend — with your rank</div>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Closing rank for {profile.category} category, {c.examLabel}. The dashed line is where you stand.</p>
          <CutoffChart chart={chart} />
        </div>
        <div className="card" style={{ background: 'var(--color-surface)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Placements</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 4 }}>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{c.avgTxt}</div><div className="text-muted" style={{ fontSize: 12 }}>Average package</div></div>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>₹{c.high} Cr</div><div className="text-muted" style={{ fontSize: 12 }}>Highest</div></div>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{c.rate}</div><div className="text-muted" style={{ fontSize: 12 }}>Placement rate</div></div>
          </div>
          <div style={{ marginTop: 8 }}><div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>Top recruiters</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Tag>Google</Tag><Tag>Microsoft</Tag><Tag>Goldman Sachs</Tag><Tag>Qualcomm</Tag><Tag>Tower Research</Tag></div></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Overview</div><div className="card-title">About {c.college}</div><p className="card-body">A premier institute known for rigorous academics, a strong alumni network and vibrant campus life in {c.city}. Sprawling residential campus with modern labs and active technical &amp; cultural clubs.</p></div>
        <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Branch</div><div className="card-title">{c.branch}</div><p className="card-body">Core coursework spans algorithms, systems and applied maths, with electives in AI/ML. Graduates head into software, quant, higher studies and research.</p></div>
        <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Fees &amp; scholarships</div><div className="card-title">{c.feesTxt}</div><p className="card-body">Merit-cum-means scholarships and fee waivers available for eligible categories. Hostel and mess charged separately.</p></div>
      </div>

      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 16 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Things to know — honest pros &amp; cons</div>
        <div className="proscons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><div style={{ fontSize: 12, color: 'var(--color-accent-2-800)', marginBottom: 6 }}>👍 Pros</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}><li>Excellent peer group and coding culture</li><li>Strong placements across software &amp; quant</li><li>Great alumni network</li></ul></div>
          <div><div style={{ fontSize: 12, color: REACH_FG, marginBottom: 6 }}>👎 Cons</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}><li>Competitive, high-pressure environment</li><li>City weather can be extreme</li><li>Popular electives fill quickly</li></ul></div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Reviews from verified seniors</div><Tag tone="accent-2">✔ Verified</Tag></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, border: '1px solid var(--color-divider)', borderRadius: 14, padding: 12 }}><div style={{ fontSize: 13 }}>⭐ 4.8 · Aarav, Y3 CSE</div><p style={{ fontSize: 13, margin: '6px 0 0' }} className="text-muted">&quot;Placements are as good as advertised, but be ready to work hard from year one.&quot;</p></div>
          <div style={{ flex: 1, minWidth: 220, border: '1px solid var(--color-divider)', borderRadius: 14, padding: 12 }}><div style={{ fontSize: 13 }}>⭐ 4.6 · Priya, Alumni</div><p style={{ fontSize: 13, margin: '6px 0 0' }} className="text-muted">&quot;The alumni network opened doors for me abroad. Hostel food is hit or miss.&quot;</p></div>
        </div>
        <Btn variant="sec" go="compare" style={{ alignSelf: 'flex-start' }}>Compare with similar colleges</Btn>
      </div>

      <div style={{ position: 'sticky', bottom: 64, marginTop: 20, display: 'flex', gap: 10, background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 12, borderRadius: 16, boxShadow: 'var(--shadow-md)' }}>
        <Btn variant="pri" act="addList" id={c.id} style={{ flex: 1 }}>+ Add to choice list</Btn>
        <Btn variant="sec" act="talkHere" id={c.id} style={{ flex: 1 }}>💬 Talk to a student here</Btn>
      </div>
    </section>
  );
}

function CutoffChart({ chart }) {
  const { W, H, pad, points, dots, yearLabels, rankY, rank } = chart;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: W }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--color-divider)" />
      <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {dots.map((d, i) => <circle key={`c${i}`} cx={d.cx} cy={d.cy} r={4.5} fill="var(--color-accent)" />)}
      {dots.map((d, i) => <text key={`v${i}`} x={d.tx} y={d.ty} textAnchor="middle" fontSize={11} fill="var(--color-neutral-700)">{d.v}</text>)}
      {yearLabels.map((y, i) => <text key={`y${i}`} x={y.x} y={y.y} textAnchor="middle" fontSize={11} fill="var(--color-neutral-600)">{y.yr}</text>)}
      <line x1={pad} y1={rankY} x2={W - pad} y2={rankY} stroke="#a8442e" strokeWidth={2} strokeDasharray="6 5" />
      <text x={W - pad} y={rankY - 6} textAnchor="end" fontSize={11} fontWeight={700} fill="#a8442e">Your rank {rank}</text>
    </svg>
  );
}

// ── College Comparison ───────────────────────────────────────────────────────
export function Compare() {
  const { profile, compareIds } = useApp();
  const items = compareIds.map((id) => byId(id, profile));
  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Compare colleges</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>Weigh your options side by side. Key differences are highlighted.</p>
      <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 520 }}>
          <thead><tr><th>Metric</th>{items.map((c) => <th key={c.id}>{c.college}<div className="text-muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{c.branch}</div></th>)}</tr></thead>
          <tbody>
            <tr><td>Your chance</td>{items.map((c) => <td key={c.id}><span className="tag" style={chipStyle(c.bucket)}>{c.label} · {c.pct}%</span></td>)}</tr>
            <tr><td>Closing rank</td>{items.map((c) => <td key={c.id}>{c.close}</td>)}</tr>
            <tr><td>Avg package</td>{items.map((c) => <td key={c.id}>{c.avgTxt}</td>)}</tr>
            <tr><td>Fees</td>{items.map((c) => <td key={c.id}>{c.feesTxt}</td>)}</tr>
            <tr><td>NIRF</td>{items.map((c) => <td key={c.id}>#{c.nirf}</td>)}</tr>
            <tr><td>Location</td>{items.map((c) => <td key={c.id}>{c.city}</td>)}</tr>
            <tr><td></td>{items.map((c) => <td key={c.id}><Btn variant="pri" act="addList" id={c.id}>Add to list</Btn></td>)}</tr>
          </tbody>
        </table>
      </div>
      <Btn variant="sec" go="predictor" style={{ marginTop: 12 }}>+ Add another college</Btn>
    </section>
  );
}

// ── Shortlist / Saved Colleges ───────────────────────────────────────────────
export function Shortlist() {
  const { profile, shortlist, runAct } = useApp();
  const items = shortlist.map((id) => byId(id, profile));
  return (
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '24px 22px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}><h1 style={{ margin: 0, fontSize: 30 }}>Saved colleges</h1><Btn variant="pri" go="choiceBuilder">Build ordered list →</Btn></div>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>A holding area before you commit to an ordered choice list.</p>
      {items.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((c) => (
            <div key={c.id} className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TypeBadge type={c.type} />
              <div style={{ flex: 1 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{c.college}</div><div className="text-muted" style={{ fontSize: 12 }}>{c.branch} · close {c.close}</div></div>
              <span className="tag" style={chipStyle(c.bucket)}>{c.label}</span>
              <Btn variant="pri" act="addList" id={c.id}>Move to list</Btn>
              <span className="sc-tile" onClick={() => runAct({ act: 'removeShort', id: c.id })} style={{ cursor: 'pointer', color: '#a8442e' }}>✕</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40, background: 'var(--color-surface)' }}><div style={{ fontSize: 38 }}>♡</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Nothing saved yet</div><p className="text-muted" style={{ fontSize: 14 }}>Tap &quot;Save&quot; on any college in the predictor to hold it here.</p><Btn variant="pri" go="predictor">Open predictor</Btn></div>
      )}
    </section>
  );
}

// ── Choice-List Builder (drag & drop) [CORE] ─────────────────────────────────
export function ChoiceBuilder() {
  const { profile, choiceList, onDragStart, onDragOver, onDragEnd, runAct, dragIndex } = useApp();
  const choiceItems = choiceList.map((id, ix) => ({ ...byId(id, profile), pos: ix + 1, idx: ix }));
  const doctor = listDoctor(choiceItems, choiceList);
  const projected = choiceItems.find((c) => c.bucket === 'safe') || choiceItems.find((c) => c.bucket === 'target') || choiceItems[0] || { college: '—', branch: 'Add colleges first' };
  return (
    <section style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 22px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        <div><div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-accent-700)' }}>Core screen</div><h1 style={{ margin: 0, fontSize: 34 }}>Choice-List Builder</h1><p className="text-muted" style={{ fontSize: 14, margin: '6px 0 0' }}>Drag rows to reorder — the order is your JoSAA priority. {choiceItems.length} choices · auto-saved just now.</p></div>
        <div style={{ display: 'flex', gap: 8 }}><Btn variant="sec" go="predictor">+ Add from predictor</Btn><Btn variant="pri" go="choiceExport">Export list</Btn></div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          {choiceItems.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {choiceItems.map((c) => (
                <div
                  key={c.idx}
                  className={['drag-row card elev-sm', dragIndex === c.idx ? 'dragging' : ''].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={() => onDragStart(c.idx)}
                  onDragOver={(e) => { e.preventDefault(); onDragOver(c.idx); }}
                  onDragEnd={onDragEnd}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, background: 'var(--color-surface)', padding: '12px 14px' }}
                >
                  <span style={{ fontSize: 18, color: 'var(--color-neutral-500)', cursor: 'grab' }}>⠿</span>
                  <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--color-accent)', color: 'var(--color-bg)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 14 }}>{c.pos}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><TypeBadge type={c.type} /><span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{c.college}</span></div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{c.branch} · close {c.close}</div>
                  </div>
                  <span className="tag" style={chipStyle(c.bucket)}>{c.label}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="sc-tile" onClick={() => runAct({ act: 'moveUp', i: c.idx })} style={{ cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>▲</span>
                    <span className="sc-tile" onClick={() => runAct({ act: 'moveDown', i: c.idx })} style={{ cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>▼</span>
                  </div>
                  <span className="sc-tile" onClick={() => runAct({ act: 'removeChoice', i: c.idx })} style={{ cursor: 'pointer', color: '#a8442e', fontSize: 16 }}>✕</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: '48px 20px', background: 'var(--color-surface)' }}><div style={{ fontSize: 42 }}>📋</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>Add your first colleges</div><p className="text-muted" style={{ fontSize: 14, maxWidth: 320 }}>Head to the predictor and tap &quot;Add to list&quot; — they&apos;ll appear here, ready to drag into your preferred order.</p><Btn variant="pri" go="predictor">Open predictor</Btn></div>
          )}
        </div>

        <aside className="builder-aside" style={{ flex: 'none', width: 300 }}>
          <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 20 }}>🩺</span><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>List Doctor</div></div>
            {doctor.map((w, i) => (
              <div key={i} style={{ borderRadius: 12, padding: '11px 12px', background: 'var(--color-bg)', borderLeft: `4px solid ${w.color}` }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{w.icon} {w.t}</div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{w.d}</div>
              </div>
            ))}
          </div>
          <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Projected allotment</div>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>With this list and order, you&apos;d most likely be allotted:</p>
            <div style={{ borderRadius: 12, padding: 12, background: 'var(--color-accent-2-100)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--color-accent-2-800)' }}>{projected.college}</div><div className="text-muted" style={{ fontSize: 12 }}>{projected.branch} · Round 2 (est.)</div></div>
          </div>
          <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Scenarios</div>
            <div className="seg" style={{ width: '100%' }}><SegOpt on style={{ flex: 1, justifyContent: 'center' }}>Balanced</SegOpt><SegOpt style={{ flex: 1, justifyContent: 'center' }}>Safe</SegOpt><SegOpt style={{ flex: 1, justifyContent: 'center' }}>Aggressive</SegOpt></div>
          </div>
        </aside>
      </div>
    </section>
  );
}

// ── Choice-List Export / Print Preview ───────────────────────────────────────
export function ChoiceExport() {
  const { profile, choiceList } = useApp();
  const choiceItems = choiceList.map((id, ix) => ({ ...byId(id, profile), pos: ix + 1 }));
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <Btn variant="ghost" go="choiceBuilder" style={{ paddingLeft: 0 }}>← Back to builder</Btn>
      <h1 style={{ margin: '4px 0 2px', fontSize: 30 }}>Export your choice list</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>A clean, numbered list — paste it into josaa.nic.in in the same order.</p>
      <div className="card" style={{ background: '#fff', border: '1px solid var(--color-divider)', color: '#201e1d' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, borderBottom: '1px solid var(--color-divider)', paddingBottom: 8 }}>JoSAA Choice List — Aditya · {choiceItems.length} choices</div>
        {choiceItems.map((c) => (
          <div key={c.pos} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '3px 0' }}><span style={{ width: 24, color: 'var(--color-neutral-600)' }}>{c.pos}.</span><span style={{ flex: 1 }}>{c.college} — {c.branch}</span><span className="text-muted">{c.type}</span></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><Btn variant="pri" act="toast" msg="Downloading PDF…">⬇ Download PDF</Btn><Btn variant="sec" act="toast" msg="Opening print dialog…">🖨 Print</Btn><Btn variant="sec" act="toast" msg="Share link copied">↗ Share</Btn></div>
      <div style={{ fontSize: 12, background: 'var(--color-accent-2-100)', borderRadius: 12, padding: 11, marginTop: 12, color: 'var(--color-accent-2-800)' }}>💡 On josaa.nic.in, add choices in this exact order under &quot;Choice Filling&quot;. Lock only when you&apos;re sure.</div>
    </section>
  );
}

// ── Browse Counsellors (Mentor Marketplace) ──────────────────────────────────
export function Marketplace() {
  return (
    <section style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Talk to a verified senior</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>25-minute 1:1 video calls · ₹100 each · every mentor is a verified current student.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}><Tag tone="accent" style={{ cursor: 'pointer' }}>All colleges</Tag><Tag style={{ cursor: 'pointer' }}>IITs</Tag><Tag style={{ cursor: 'pointer' }}>NITs</Tag><Tag style={{ cursor: 'pointer' }}>CSE</Tag><Tag style={{ cursor: 'pointer' }}>Soonest available</Tag><Tag style={{ cursor: 'pointer' }}>Top rated</Tag></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {MENTORS.map((m) => (
          <div key={m.id} className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><Avatar initials={m.initials} color={m.color} size={48} /><div style={{ flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{m.name}</span><span className="tag tag-accent-2" style={{ padding: '1px 7px' }}>✔</span></div><div className="text-muted" style={{ fontSize: 12 }}>{m.college} · {m.branch} · Y{m.year}</div></div></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>⭐ {m.rating} · {m.sessions} sessions</span><span style={{ fontFamily: 'var(--font-heading)' }}>₹{m.price}</span></div>
            <div className="text-muted" style={{ fontSize: 12 }}>Next: {m.nextSlot}</div>
            <div style={{ display: 'flex', gap: 6 }}><Btn variant="pri" act="viewMentor" id={m.id} style={{ flex: 1 }}>View &amp; book</Btn></div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Mentor Profile (student view) ─────────────────────────────────────────────
export function MentorProfile() {
  const { mentorSel } = useApp();
  const m = MENTORS.find((x) => x.id === mentorSel) || MENTORS[0];
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <Btn variant="ghost" go="marketplace" style={{ paddingLeft: 0 }}>← Back to mentors</Btn>
      <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginTop: 6 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}><Avatar initials={m.initials} color={m.color} size={66} /><div style={{ flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h2 style={{ margin: 0 }}>{m.name}</h2><Tag tone="accent-2">✔ Verified</Tag></div><div className="text-muted" style={{ fontSize: 14 }}>{m.college} · {m.branch} · Year {m.year}</div><div style={{ fontSize: 13, marginTop: 4 }}>⭐ {m.rating} · {m.sessions} sessions</div></div><div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 24 }}>₹{m.price}</div><div className="text-muted" style={{ fontSize: 12 }}>per 25 min</div></div></div>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}><div className="card-kicker">About</div><p style={{ fontSize: 14, margin: 0 }}>Happy to give you an honest, no-sugarcoat picture of life here — academics, the coding culture, placements and everything in between.</p><div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginTop: 8 }}>Helps with</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{m.topics.map((t) => <Tag key={t}>{t}</Tag>)}</div><div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginTop: 8 }}>Languages</div><div style={{ fontSize: 13 }}>{m.langs.join(', ')}</div></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}><div className="card-kicker">Reviews</div><div style={{ fontSize: 13 }}>⭐⭐⭐⭐⭐ &quot;Cleared all my doubts about CSE. Super honest!&quot; — Riya</div><div style={{ fontSize: 13 }}>⭐⭐⭐⭐⭐ &quot;Best ₹100 I spent this counselling season.&quot; — Dev</div></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}><Btn variant="pri" go="booking" style={{ flex: 1, padding: 13 }}>Book a session</Btn><Btn variant="sec" act="toast" msg="Reported — thanks">⚑ Report</Btn></div>
    </section>
  );
}

// ── Booking / Scheduling ──────────────────────────────────────────────────────
export function Booking() {
  const { mentorSel, bookingSlot, runAct } = useApp();
  const m = MENTORS.find((x) => x.id === mentorSel) || MENTORS[0];
  const selectedSlot = bookingSlot || '6:30 PM, Today';
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <Btn variant="ghost" go="mentorProfile" style={{ paddingLeft: 0 }}>← Back</Btn>
      <h1 style={{ margin: '4px 0 2px', fontSize: 28 }}>Pick a slot</h1>
      <div className="card" style={{ background: 'var(--color-surface)', flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar initials={m.initials} color={m.color} size={40} /><div><div style={{ fontWeight: 700 }}>{m.name}</div><div className="text-muted" style={{ fontSize: 12 }}>{m.college} · ₹{m.price} / 25 min</div></div></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
        <div className="card-kicker">Today, Jul 13</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SLOT_LIST.map((t) => (
          <span key={t} className="tag" onClick={() => runAct({ act: 'bookSlot', slot: t })} style={{ cursor: 'pointer', ...(bookingSlot === t ? { background: 'var(--color-accent)', color: 'var(--color-bg)' } : { border: '1px solid var(--color-accent)', color: 'var(--color-accent-700)' }) }}>{t}</span>
        ))}</div>
        <Field label={`A note or question for ${m.name} (optional)`}><textarea className="input" placeholder="e.g. CSE at a lower IIT vs ECE at a top one?" /></Field>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontSize: 13 }}>25-min 1:1 video call</div><div className="text-muted" style={{ fontSize: 12 }}>Selected: {selectedSlot}</div></div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>₹{m.price}</div></div>
      <Btn variant="pri" go="payment" block style={{ padding: 13, marginTop: 14 }}>Proceed to pay →</Btn>
    </section>
  );
}

// ── Payment / Checkout ────────────────────────────────────────────────────────
export function Payment() {
  const { mentorSel, bookingSlot } = useApp();
  const m = MENTORS.find((x) => x.id === mentorSel) || MENTORS[0];
  const selectedSlot = bookingSlot || '6:30 PM, Today';
  return (
    <section style={{ maxWidth: 520, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Checkout</h1>
      <div className="card" style={{ background: 'var(--color-surface)' }}>
        <div className="card-kicker">Order summary</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{m.name} · 25 min</span><span>₹{m.price}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }} className="text-muted"><span>{selectedSlot}</span><span></span></div>
        <div className="hr" style={{ margin: '6px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-heading)', fontSize: 18 }}><span>Total</span><span>₹{m.price}</span></div>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
        <div className="card-kicker">Payment method</div>
        <label className="radio" style={{ border: '1px solid var(--color-accent)', borderRadius: 14, padding: 12, background: 'var(--color-accent-100)' }}><input type="radio" name="pay" defaultChecked /><span className="dot" />UPI (GPay / PhonePe / Paytm)</label>
        <label className="radio" style={{ border: '1px solid var(--color-divider)', borderRadius: 14, padding: 12 }}><input type="radio" name="pay" /><span className="dot" />Credit / debit card</label>
        <Field label="Have a coupon?"><div style={{ display: 'flex', gap: 8 }}><Input placeholder="Enter code" style={{ flex: 1 }} /><Btn variant="sec" act="toast" msg="Coupon applied">Apply</Btn></div></Field>
      </div>
      <Btn variant="pri" go="bookingConfirm" block style={{ padding: 13, marginTop: 14 }}>🔒 Pay ₹{m.price} securely</Btn>
      <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>Payments processed by our secure gateway. Full refund if the mentor no-shows.</p>
    </section>
  );
}

// ── Booking Confirmation ──────────────────────────────────────────────────────
export function BookingConfirm() {
  const { mentorSel, bookingSlot } = useApp();
  const m = MENTORS.find((x) => x.id === mentorSel) || MENTORS[0];
  const selectedSlot = bookingSlot || '6:30 PM, Today';
  return (
    <section style={{ maxWidth: 520, margin: '0 auto', padding: '40px 22px' }}>
      <div className="card elev-md" style={{ background: 'var(--color-surface)', alignItems: 'center', textAlign: 'center', padding: 32 }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--color-accent-2-100)', display: 'grid', placeItems: 'center', fontSize: 32 }}>✅</div>
        <h2 style={{ margin: '2px 0' }}>You&apos;re booked!</h2>
        <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>Session with <strong style={{ color: 'var(--color-text)' }}>{m.name}</strong> · {selectedSlot} · 25 min</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}><Btn variant="pri" go="sessionRoom">Join session</Btn><Btn variant="sec" act="toast" msg="Added to calendar">📅 Add to calendar</Btn></div>
        <div style={{ width: '100%', textAlign: 'left', background: 'var(--color-bg)', borderRadius: 14, padding: 14, fontSize: 13 }}><strong>Prep tips</strong><ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}><li>Have your rank &amp; shortlist ready</li><li>Join from a quiet spot with good internet</li><li>Note your top 2–3 questions</li></ul></div>
        <div className="text-muted" style={{ fontSize: 12 }}>Free cancellation up to 4 hours before. <span className="sc-tile" style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Contact support</span></div>
      </div>
    </section>
  );
}

// ── My Sessions / Bookings ────────────────────────────────────────────────────
export function Sessions() {
  const { sessionsTab, runAct } = useApp();
  const sess = SESSION_MAP[sessionsTab];
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 30 }}>My sessions</h1>
      <div className="seg" style={{ marginBottom: 14 }}>
        {['upcoming', 'past', 'cancelled'].map((tab) => (
          <SegOpt key={tab} on={sessionsTab === tab} onClick={() => runAct({ act: 'sessTab', tab })} style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize' }}>{tab}</SegOpt>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar initials="AS" size={42} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>Aarav Sharma · IIT Bombay</div><div className="text-muted" style={{ fontSize: 12 }}>{sess.line}</div></div>
          {sess.actions.map((a, i) => (
            <Btn key={i} variant={a.cls} go={a.go} act={a.act} msg={a.msg} dialog={a.dialog}>{a.label}</Btn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Session Room — 1:1 Video Call [CORE] ─────────────────────────────────────
export function SessionRoom() {
  const { sessTime, camOn, micOn, chat, chatDraft, update, sendChat, runAct, navigate } = useApp();
  const chatStyled = chat.map((m) => ({ ...m, style: { alignSelf: m.who === 'me' ? 'flex-end' : 'flex-start', background: m.who === 'me' ? 'var(--color-accent)' : 'var(--color-surface)', color: m.who === 'me' ? 'var(--color-bg)' : 'var(--color-text)', fontSize: 13, borderRadius: 14, padding: '8px 11px', maxWidth: '82%' } }));
  return (
    <section style={{ background: 'var(--color-neutral-900)', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', color: '#fff', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#5fce7f', animation: 'pulse 1.6s infinite' }} /><span style={{ fontSize: 14 }}>Connected · 25-min session</span></div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, background: 'rgba(255,255,255,.1)', padding: '4px 16px', borderRadius: 999 }}>{fmtTime(sessTime)} <span style={{ opacity: .5, fontSize: 14 }}>/ 25:00</span></div>
        <span style={{ fontSize: 13, color: '#5fce7f' }}>▮▮▮▮▯ Good connection</span>
      </div>
      <div className="session-body" style={{ flex: 1, display: 'flex', gap: 14, padding: '0 20px 14px', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ flex: 1, minHeight: 320, borderRadius: 20, background: 'linear-gradient(135deg,#56633f,#3d472b)', position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <span style={{ width: 96, height: 96, borderRadius: '50%', background: '#c67139', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 40 }}>AS</span>
            <div style={{ position: 'absolute', bottom: 14, left: 16, color: '#fff', fontSize: 14, background: 'rgba(0,0,0,.35)', padding: '4px 12px', borderRadius: 999 }}>Aarav Sharma · IIT Bombay</div>
            <div style={{ position: 'absolute', top: 14, right: 16, width: 150, height: 100, borderRadius: 14, background: '#201e1d', border: '2px solid rgba(255,255,255,.2)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 12 }}>{camOn ? 'You' : 'Camera off'}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button className="sc-btn" onClick={() => runAct({ act: 'toggleMic' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{micOn ? '🎤' : '🔇'}</button>
            <button className="sc-btn" onClick={() => runAct({ act: 'toggleCam' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{camOn ? '📷' : '🚫'}</button>
            <button className="sc-btn" onClick={() => runAct({ act: 'toast', msg: 'Screen sharing started' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>🖥</button>
            <button className="sc-btn" onClick={() => runAct({ act: 'toast', msg: 'Reported to support' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>⚑</button>
            <button className="sc-btn" onClick={() => navigate('rateSession')} style={{ background: '#a8442e', color: '#fff', padding: '0 22px', borderRadius: 999 }}>End session</button>
          </div>
        </div>
        <aside className="session-chat" style={{ flex: 'none', width: 300, background: 'var(--color-bg)', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-divider)', fontFamily: 'var(--font-heading)', fontSize: 15 }}>Chat</div>
          <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 160 }}>
            <div style={{ fontSize: 12, background: 'var(--color-accent-100)', borderRadius: 12, padding: '8px 11px', color: 'var(--color-accent-800)' }}><strong>Your question:</strong> Should I pick CSE at a lower IIT or ECE at a top one?</div>
            {chatStyled.map((m, i) => <div key={i} style={m.style}>{m.t}</div>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} style={{ padding: 10, borderTop: '1px solid var(--color-divider)', display: 'flex', gap: 6 }}>
            <Input placeholder="Message…" value={chatDraft} onChange={(e) => update({ chatDraft: e.target.value })} style={{ flex: 1 }} />
            <Btn variant="pri" onClick={(e) => { e.preventDefault(); sendChat(); }}>Send</Btn>
          </form>
        </aside>
      </div>
    </section>
  );
}

// ── Post-Session — Rate & Review ──────────────────────────────────────────────
export function RateSession() {
  const { runAct } = useApp();
  return (
    <section style={{ maxWidth: 560, margin: '0 auto', padding: '40px 22px' }}>
      <div className="card elev-md" style={{ background: 'var(--color-surface)', alignItems: 'center', textAlign: 'center', padding: 32 }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 26 }}>AS</div>
        <h2 style={{ margin: '6px 0 0' }}>How was your session?</h2>
        <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>with Aarav Sharma · IIT Bombay</p>
        <div style={{ fontSize: 34, letterSpacing: 6, cursor: 'pointer' }} onClick={() => runAct({ act: 'toast', msg: 'Thanks for rating!' })}>⭐⭐⭐⭐⭐</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}><Tag style={{ cursor: 'pointer' }}>Helpful</Tag><Tag style={{ cursor: 'pointer' }}>Honest</Tag><Tag style={{ cursor: 'pointer' }}>Knowledgeable</Tag></div>
        <textarea className="input" placeholder="Write a review (optional)…" />
        <Btn variant="pri" go="dashboard" block>Submit review</Btn>
        <Btn variant="ghost" go="marketplace">Book another session</Btn>
      </div>
    </section>
  );
}

// ── Counselling Timeline / Deadlines ──────────────────────────────────────────
export function Timeline() {
  const toneStyle = (tone) => tone === 'accent-2' ? { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' } : tone === 'accent' ? { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' } : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)' };
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Counselling timeline</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 16 }}>JoSAA 2026 rounds. We&apos;ll remind you before every deadline.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {ROUNDS.map((r) => (
          <div key={r.title} style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ width: 16, height: 16, borderRadius: '50%', background: r.dot, border: '3px solid var(--color-bg)', boxShadow: `0 0 0 2px ${r.dot}` }} /><span style={{ flex: 1, width: 2, background: 'var(--color-divider)' }} /></div>
            <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginBottom: 12, flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{r.title}</div><span className="tag" style={toneStyle(r.tone)}>{r.status}</span></div><div className="text-muted" style={{ fontSize: 13 }}>{r.date} · {r.desc}</div></div>
          </div>
        ))}
      </div>
      <div className="card" style={{ background: 'var(--color-accent-100)', marginTop: 6 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Freeze / Float / Slide — in plain words</div><div style={{ fontSize: 13, lineHeight: 1.7 }}><strong>Freeze:</strong> Happy with your seat — lock it, exit counselling.<br /><strong>Float:</strong> Keep this seat but stay open to any better option.<br /><strong>Slide:</strong> Keep this college, but try for a better branch in it.</div></div>
    </section>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────
export function Notifications() {
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h1 style={{ margin: 0, fontSize: 30 }}>Notifications</h1><Btn variant="ghost" go="settings">Settings</Btn></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {NOTIFS.map((n, i) => (
          <div key={i} className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 12, alignItems: 'flex-start', ...(n.unread ? { borderLeft: '4px solid var(--color-accent)' } : {}) }}><span style={{ fontSize: 20 }}>{n.icon}</span><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{n.title}</div><div className="text-muted" style={{ fontSize: 13 }}>{n.body}</div></div><span className="text-muted" style={{ fontSize: 11 }}>{n.time}</span></div>
        ))}
      </div>
    </section>
  );
}

// ── Help / Support ────────────────────────────────────────────────────────────
export function Help() {
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 30 }}>Help &amp; support</h1>
      <Field><Input placeholder="Search help articles…" /></Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {FAQS.slice(0, 3).map((f, i) => (
          <details key={i} className="card" style={{ background: 'var(--color-surface)' }}><summary style={{ fontFamily: 'var(--font-heading)', fontSize: 15, cursor: 'pointer' }}>{f.q}</summary><p style={{ fontSize: 13, margin: '8px 0 0' }} className="text-muted">{f.a}</p></details>
        ))}
      </div>
      <div className="card" style={{ background: 'var(--color-accent-100)', marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Still stuck?</div><div className="text-muted" style={{ fontSize: 13 }}>We reply within a few hours during season.</div></div><Btn variant="pri" act="toast" msg="Chat opened">Chat with us</Btn></div>
    </section>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function Settings() {
  const { runAct } = useApp();
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 14px', fontSize: 30 }}>Settings</h1>
      {SETTING_GROUPS.map((g) => (
        <div key={g.title} className="card" style={{ background: 'var(--color-surface)', marginBottom: 12 }}>
          <div className="card-kicker">{g.title}</div>
          {g.rows.map((r, i) => (
            <div key={i} className="sc-row" onClick={() => runAct({ go: r.go, act: r.act, msg: r.msg })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 4px', fontSize: 14, cursor: 'pointer' }}>{r.label}<span className="text-muted">{r.val} ›</span></div>
          ))}
        </div>
      ))}
      <Btn variant="sec" go="login" block>Log out</Btn>
      <Btn variant="ghost" act="toast" msg="Account deletion requested" block style={{ color: '#a8442e' }}>Delete account</Btn>
    </section>
  );
}

// ── Payment History / Receipts ────────────────────────────────────────────────
export function Receipts() {
  const toneStyle = (tone) => tone === 'accent-2' ? { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' } : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)' };
  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 30 }}>Payment history</h1>
      <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 420 }}><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
          {TXNS.map((t, i) => <tr key={i}><td>{t.date}</td><td>{t.item}</td><td>₹{t.amt}</td><td><span className="tag" style={toneStyle(t.tone)}>{t.status}</span></td><td><Btn variant="ghost" act="toast" msg="Receipt downloaded">Receipt</Btn></td></tr>)}
        </tbody></table>
      </div>
    </section>
  );
}
