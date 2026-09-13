'use client';
// ══════════════════════════════════════════════════════════════════════════
// College Data Hub sections (Phase 12) — renders `profile.content.hub` from
// GET /colleges/:slug/profile. Every section is null until collected, in which
// case the matching "coming soon" card stays. Every rendered figure shows its
// source (publisher · asOf) — the hub's ground rule is "no source, no number".
// ══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { Tag } from '@/components/ui';

const fmtINR = (n) => (n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);
const fmtLpa = (n) => (n == null ? '—' : `${n} LPA`);
const fmtPct = (n) => (n == null ? '—' : `${n}%`);
const H = ({ children }) => <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>{children}</div>;
const Card = ({ icon, title, right, children, span }) => (
  <div className="card" style={{ background: 'var(--color-surface)', gap: 10, gridColumn: span ? '1 / -1' : undefined }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{icon}</span><H>{title}</H>{right && <span style={{ marginLeft: 'auto' }}>{right}</span>}</div>
    {children}
  </div>
);
const Muted = ({ children, style }) => <p className="text-muted" style={{ fontSize: 13, margin: 0, ...style }}>{children}</p>;

export function ComingSoon({ icon, title, note }) {
  return (
    <div className="card" style={{ background: 'var(--color-surface)', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{icon}</span><H>{title}</H><Tag tone="outline" style={{ marginLeft: 'auto', fontSize: 11 }}>Coming soon</Tag></div>
      <Muted>{note}</Muted>
    </div>
  );
}

/** "Source: IIT Bombay · 2024-25" with a link to the first (best) source. */
function Src({ sources, asOf, style }) {
  if (!sources?.length) return null;
  const s = sources[0];
  const extra = sources.length - 1;
  return (
    <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', ...style }}>
      Source: <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{s.publisher}</a>
      {(asOf || s.asOf) ? ` · ${asOf || s.asOf}` : ''}{s.confidence === 'secondary' ? ' · secondary source' : ''}{extra > 0 ? ` · +${extra} more` : ''}
    </div>
  );
}

const th = { textAlign: 'left', fontSize: 12, color: 'var(--color-neutral-600)', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid var(--color-divider)' };
const td = { fontSize: 13, padding: '6px 8px', borderBottom: '1px solid var(--color-divider)', whiteSpace: 'nowrap' };
const Table = ({ head, rows }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr>{head.map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={td}>{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

// ── Fees ──────────────────────────────────────────────────────────────────────
function FeesCard({ fees }) {
  const years = fees.years || [];
  return (
    <Card icon="💰" title="Fee structure">
      {years.length ? (
        <>
          <Table head={['Year', 'Program', 'Tuition', 'Hostel', 'Mess', 'Other', 'Total / yr']}
            rows={years.map((y) => [y.year, y.program || 'All UG', fmtINR(y.tuition), fmtINR(y.hostel), fmtINR(y.mess), fmtINR(y.other), <strong key="t">{fmtINR(y.totalYear)}</strong>])} />
          <Src sources={years[0].sources} asOf={years[0].asOf} />
        </>
      ) : <Muted>Fee split not published in a citable form yet.</Muted>}
      {fees.scholarships?.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Scholarships & waivers</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
            {fees.scholarships.map((s, i) => <li key={i}><strong>{s.name}</strong>{s.benefit ? ` — ${s.benefit}` : ''}{s.eligibility ? <span className="text-muted"> ({s.eligibility})</span> : ''}</li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ── Seat matrix ───────────────────────────────────────────────────────────────
const SEAT_COLS = ['OPEN', 'EWS', 'OBC-NCL', 'SC', 'ST'];
function SeatMatrixCard({ sm }) {
  const [full, setFull] = useState(false);
  const byProgram = new Map();
  for (const r of sm.rows) {
    let e = byProgram.get(r.program);
    if (!e) { e = { total: 0, female: 0, cats: Object.fromEntries(SEAT_COLS.map((c) => [c, 0])) }; byProgram.set(r.program, e); }
    e.total += r.seats;
    if (r.gender === 'F') e.female += r.seats;
    const base = r.seatType.replace(' (PwD)', '');
    if (base in e.cats) e.cats[base] += r.seats;
  }
  const programs = [...byProgram.entries()].sort((a, b) => b[1].total - a[1].total);
  const shown = full ? programs : programs.slice(0, 8);
  const total = programs.reduce((s, [, e]) => s + e.total, 0);
  return (
    <Card icon="🪑" title={`Seat matrix · JoSAA ${sm.josaaYear}`} right={<Tag tone="outline" style={{ fontSize: 11 }}>{total.toLocaleString('en-IN')} seats</Tag>} span>
      <Muted>Seats per programme (all quotas, both gender pools). Category columns include PwD sub-seats; “Female” is the female-only pool within the total.</Muted>
      <Table head={['Programme', 'Total', 'Female', ...SEAT_COLS]}
        rows={shown.map(([p, e]) => [<span key="p" style={{ whiteSpace: 'normal' }}>{p.replace(/\s*\(.*\)$/, '')}</span>, <strong key="t">{e.total}</strong>, e.female, ...SEAT_COLS.map((c) => e.cats[c])])} />
      {programs.length > 8 && <button type="button" onClick={() => setFull(!full)} style={{ alignSelf: 'flex-start', background: 'none', border: 0, color: 'var(--color-accent-800)', fontSize: 13, cursor: 'pointer', padding: 0 }}>{full ? 'Show fewer' : `Show all ${programs.length} programmes`}</button>}
      <Src sources={sm.sources} asOf={sm.asOf} />
    </Card>
  );
}

// ── Placements ────────────────────────────────────────────────────────────────
function PlacementsCard({ pl }) {
  const years = pl.years || [];
  if (!years.length) return <Card icon="📊" title="Placements"><Muted>No citable placement report found yet.</Muted></Card>;
  const latest = years[0];
  const Stat = ({ k, v }) => <div style={{ flex: 1, minWidth: 96 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>{v}</div><div style={{ fontSize: 12 }} className="text-muted">{k}</div></div>;
  return (
    <Card icon="📊" title={`Placements · ${latest.year}`} span>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Stat k="Median" v={fmtLpa(latest.medianLpa)} /><Stat k="Average" v={fmtLpa(latest.avgLpa)} /><Stat k="Highest" v={fmtLpa(latest.highestLpa)} />
        <Stat k="Placed" v={fmtPct(latest.pctPlaced)} /><Stat k="Offers" v={latest.offers ?? '—'} /><Stat k="PPOs" v={latest.ppos ?? '—'} /><Stat k="Higher studies" v={fmtPct(latest.higherStudiesPct)} />
      </div>
      <Src sources={latest.sources} asOf={latest.asOf} />
      {years.length > 1 && (
        <Table head={['Year', 'Median', 'Average', 'Highest', 'Placed', 'Offers']}
          rows={years.map((y) => [y.year, fmtLpa(y.medianLpa), fmtLpa(y.avgLpa), fmtLpa(y.highestLpa), fmtPct(y.pctPlaced), y.offers ?? '—'])} />
      )}
      {latest.topRecruiters?.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Top recruiters</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{latest.topRecruiters.map((r, i) => <Tag key={i} tone="outline" style={{ fontSize: 11 }}>{r.name}</Tag>)}</div>
        </div>
      )}
      {latest.branchWise?.length > 0 && (
        <details><summary style={{ fontSize: 13, cursor: 'pointer' }}>Branch-wise ({latest.branchWise.length})</summary>
          <Table head={['Programme', 'Median', 'Average', 'Placed']} rows={latest.branchWise.map((b) => [b.program, fmtLpa(b.medianLpa), fmtLpa(b.avgLpa), fmtPct(b.pctPlaced)])} />
        </details>
      )}
    </Card>
  );
}

// ── Campus, hostels, social ───────────────────────────────────────────────────
const PLATFORM_ICON = { instagram: '📸', youtube: '▶️', linkedin: '💼', x: '𝕏', facebook: '📘', telegram: '✈️', other: '🔗' };
function CampusCard({ profile, life, hostels, social }) {
  const loc = profile?.location;
  return (
    <Card icon="🏫" title="Campus & student life" span>
      {profile?.about && <p style={{ fontSize: 14, margin: 0, lineHeight: 1.55 }}>{profile.about}</p>}
      {life?.summary?.text && <Muted style={{ fontSize: 14, color: 'inherit' }}>{life.summary.text}</Muted>}
      {loc && (
        <div style={{ fontSize: 13 }}>
          <strong>Getting there.</strong> {loc.city}, {loc.state}{loc.campusAcres ? ` · ${loc.campusAcres} acres` : ''}{loc.nearestAirport ? ` · ✈ ${loc.nearestAirport}` : ''}{loc.nearestRailway ? ` · 🚉 ${loc.nearestRailway}` : ''}
          {loc.connectivityNote ? <span className="text-muted"> — {loc.connectivityNote}</span> : ''}
          <Src sources={loc.sources} asOf={loc.asOf} />
        </div>
      )}
      {life?.fests?.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Fests</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            {life.fests.map((f, i) => (
              <div key={i} style={{ background: 'var(--color-bg)', borderRadius: 12, padding: '8px 12px', fontSize: 13 }}>
                <div><strong>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : f.name}</strong> <span className="text-muted">· {f.type}</span></div>
                <div className="text-muted" style={{ fontSize: 12 }}>{[f.month, f.footfall ? `~${f.footfall.toLocaleString('en-IN')} footfall` : null].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {life?.clubs?.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Clubs & societies ({life.clubs.length})</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{life.clubs.map((c, i) => <Tag key={i} tone="outline" style={{ fontSize: 11 }} title={c.note || ''}>{c.name} <span className="text-muted">· {c.category}</span></Tag>)}</div>
        </div>
      )}
      {hostels && (
        <div style={{ fontSize: 13 }}>
          <strong>Hostels.</strong> {[hostels.count ? `${hostels.count} hostels` : null, hostels.capacity ? `~${hostels.capacity.toLocaleString('en-IN')} beds` : null, hostels.occupancy].filter(Boolean).join(' · ') || '—'}
          {hostels.messNote ? <span className="text-muted"> — {hostels.messNote}</span> : ''}
          <Src sources={hostels.sources} asOf={hostels.asOf} />
        </div>
      )}
      {(social?.official?.length > 0 || social?.creators?.length > 0) && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Follow the campus</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {social.official.map((s, i) => <a key={`o${i}`} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, background: 'var(--color-bg)', borderRadius: 999, padding: '4px 10px', textDecoration: 'none' }}>{PLATFORM_ICON[s.platform] || '🔗'} {s.owner || s.handle}</a>)}
            {social.creators.map((s, i) => <a key={`c${i}`} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, background: 'var(--color-accent-100)', borderRadius: 999, padding: '4px 10px', textDecoration: 'none' }}>{PLATFORM_ICON[s.platform] || '🔗'} {s.handle} <span className="text-muted">· {s.affiliation} · {s.followerBand}</span></a>)}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Academics & rankings ──────────────────────────────────────────────────────
function AcademicsCard({ ac, rk }) {
  const depts = ac?.departments || [];
  const nirf = rk?.nirf || [];
  return (
    <Card icon="🎓" title="Academics & rankings">
      {nirf.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {nirf.map((n, i) => <div key={i} style={{ background: 'var(--color-bg)', borderRadius: 12, padding: '6px 10px', fontSize: 12 }}><strong>NIRF {n.year}</strong> · Eng #{n.engineering ?? '—'} · Overall #{n.overall ?? '—'}</div>)}
          {rk.naac && <div style={{ background: 'var(--color-bg)', borderRadius: 12, padding: '6px 10px', fontSize: 12 }}><strong>NAAC</strong> {rk.naac.grade}</div>}
        </div>
      )}
      {ac?.facultyCount && <Muted><strong style={{ color: 'inherit' }}>{ac.facultyCount.value.toLocaleString('en-IN')}</strong> faculty <Src sources={ac.facultyCount.sources} asOf={ac.facultyCount.asOf} style={{ display: 'inline' }} /></Muted>}
      {depts.length > 0 && (
        <details>
          <summary style={{ fontSize: 13, cursor: 'pointer' }}>Departments & UG programmes ({depts.length})</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, display: 'grid', gap: 3 }}>
            {depts.map((d, i) => <li key={i}><strong>{d.name}</strong>{d.programs?.length ? `: ${d.programs.map((p) => `${p.degree} ${p.name}${p.intake ? ` (${p.intake})` : ''}`).join(' · ')}` : ''}</li>)}
          </ul>
        </details>
      )}
      {ac?.curriculumHighlights?.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 3 }}>{ac.curriculumHighlights.map((h, i) => h.text && <li key={i}>{h.text}</li>)}</ul>
      )}
      {ac?.research?.note && <Muted>{ac.research.note}</Muted>}
    </Card>
  );
}

// ── Alumni + FAQs ─────────────────────────────────────────────────────────────
function PeopleCard({ alumni, faqs }) {
  const notable = alumni?.notable || [];
  const items = faqs?.items || [];
  return (
    <Card icon="💬" title="Alumni & FAQs" span>
      {notable.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Notable alumni</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{notable.map((a, i) => <Tag key={i} tone="outline" style={{ fontSize: 11 }} title={a.knownFor || ''}>{a.name}{a.knownFor ? ` · ${a.knownFor}` : ''}</Tag>)}</div>
        </div>
      )}
      {items.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {items.map((f, i) => (
            <details key={i} style={{ background: 'var(--color-bg)', borderRadius: 12, padding: '8px 12px' }}>
              <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{f.q}</summary>
              <p style={{ fontSize: 13, margin: '6px 0 0' }}>{f.a || '—'}</p>
              <Src sources={f.sources} asOf={f.asOf} style={{ marginTop: 4 }} />
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}

const NOTES = {
  fees: 'Tuition, hostel & mess split with category waivers — sourced from official fee circulars & NIRF data.',
  seats: 'Seats per programme × category × gender pool from the official JoSAA seat matrix.',
  placements: 'Median / average / highest package with year, % placed and top recruiters — official, year-labelled figures.',
  campus: 'About the institute, how to reach, hostels, clubs, fests and official campus accounts.',
};

/** The "More about <college>" grid. `hub` = profile.content.hub (may be null). */
export function HubSections({ hub, inst }) {
  const h = hub || {};
  const hasCampus = h.profile?.about || h['campus-life'] || h.hostels || h.social;
  const hasAcademics = h.academics || h.rankings?.nirf?.length;
  const hasPeople = h.alumni?.notable?.length || h.faqs?.items?.length;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {h.fees ? <FeesCard fees={h.fees} /> : <ComingSoon icon="💰" title="Fee structure" note={NOTES.fees} />}
        {hasAcademics ? <AcademicsCard ac={h.academics} rk={h.rankings} /> : null}
        {h.placements ? <PlacementsCard pl={h.placements} /> : <ComingSoon icon="📊" title="Placements" note={NOTES.placements} />}
        {h['seat-matrix'] ? <SeatMatrixCard sm={h['seat-matrix']} /> : <ComingSoon icon="🪑" title="Seat matrix" note={NOTES.seats} />}
        {hasCampus ? <CampusCard profile={h.profile} life={h['campus-life']} hostels={h.hostels} social={h.social} /> : <ComingSoon icon="🏫" title={`Campus & life at ${inst.short}`} note={NOTES.campus} />}
        {hasPeople ? <PeopleCard alumni={h.alumni} faqs={h.faqs} /> : null}
      </div>
      {hub && <Muted style={{ marginTop: 8, fontSize: 11 }}>Facts are quoted from the linked sources with their publication year; text is our own summary. Spotted an error? Tell a mentor on the Talk tab and we will fix the record.</Muted>}
    </>
  );
}
