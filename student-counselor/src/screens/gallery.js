'use client';
// Gallery — the "All screens" index; jump into any screen or the CORE flows.
import { useApp } from '@/lib/store';
import { Btn, Tile } from '@/components/ui';
import { GALLERY_GROUPS } from '@/lib/data';

const CORE = [
  { go: 'predictor', tone: 'accent', tag: 'accent', title: 'College Predictor', body: 'Live filters, Safe / Target / Reach.' },
  { go: 'collegeDetail', tone: 'accent-2', tag: 'accent-2', title: 'College Analysis', body: 'Cutoff trend with your rank marked.' },
  { go: 'choiceBuilder', tone: 'accent', tag: 'accent', title: 'Choice-List Builder', body: 'Drag to reorder + List Doctor.' },
  { go: 'sessionRoom', tone: 'accent-2', tag: 'accent-2', title: '1:1 Session Room', body: 'Live 25-min video call.' },
];

export default function Gallery() {
  const { navigate } = useApp();
  return (
    <section style={{ maxWidth: 1180, margin: '0 auto', padding: '44px 26px 80px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 18, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginBottom: 8 }}>Interactive prototype · v1 scope</div>
          <h1 style={{ fontSize: 52, margin: '0 0 10px' }}>Student-Counselor</h1>
          <p className="text-muted" style={{ fontSize: 17, maxWidth: 620, margin: 0 }}>
            Every screen in the product, clickable and connected. Jump into the four <strong style={{ color: 'var(--color-accent-700)' }}>CORE</strong> flows or open any screen below. Predict colleges from your JEE rank, plan your JoSAA choice list, and talk to a verified senior.
          </p>
        </div>
        <Btn variant="pri" go="landing" style={{ padding: '13px 22px', fontSize: 15 }}>Open the live app →</Btn>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '30px 0 36px' }}>
        {CORE.map((c) => (
          <Tile key={c.go} go={c.go} className="card elev-sm" style={{ flex: 1, minWidth: 200, background: c.tone === 'accent' ? 'var(--color-accent-100)' : 'var(--color-accent-2-100)' }}>
            <div className={`tag tag-${c.tag}`} style={{ alignSelf: 'flex-start' }}>CORE</div>
            <div className="card-title">{c.title}</div>
            <p className="card-body">{c.body}</p>
          </Tile>
        ))}
      </div>

      {GALLERY_GROUPS.map((grp) => (
        <div key={grp.title} style={{ marginBottom: 30 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>{grp.title}</h3>
            <span className="text-muted" style={{ fontSize: 13 }}>{grp.items.length} screens</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
            {grp.items.map(([id, label, tag]) => (
              <div key={id + label} className="sc-tile" onClick={() => navigate(id)} style={{ background: 'var(--color-surface)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--color-divider)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-accent-700)' }}>{tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
