'use client';
// ══════════════════════════════════════════════════════════════════════════
// Reusable UI primitives built on the Organic design system.
// ══════════════════════════════════════════════════════════════════════════
import { useApp } from '@/lib/store';
import { chipStyle, dotColor, typeStyle } from '@/lib/logic';

// Button / link that mirrors the prototype's data-go / data-act semantics.
export function Btn({
  variant = 'sec', go, act, id, msg, dialog, slot, tab, i, slug,
  as = 'button', block = false, style = {}, className = '', children, onClick, ...rest
}) {
  const { runAct } = useApp();
  const cls = ['sc-btn', variant, block ? 'block' : '', className].filter(Boolean).join(' ');
  const handle = (e) => {
    if (onClick) return onClick(e);
    runAct({ go, act, id, msg, dialog, slot, tab, i, slug });
  };
  const Tag = as;
  return (
    <Tag className={cls} style={style} onClick={handle} {...rest}>
      {children}
    </Tag>
  );
}

// A small clickable tile (card lift on hover) that navigates or runs an action.
export function Tile({ go, act, id, msg, dialog, style = {}, className = '', children, ...rest }) {
  const { runAct } = useApp();
  return (
    <div
      className={['sc-tile', className].filter(Boolean).join(' ')}
      style={{ cursor: 'pointer', ...style }}
      onClick={() => runAct({ go, act, id, msg, dialog })}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Tag({ tone = 'neutral', style = {}, children }) {
  const cls = tone === 'accent' ? 'tag tag-accent' : tone === 'accent-2' ? 'tag tag-accent-2' : tone === 'outline' ? 'tag tag-outline' : 'tag tag-neutral';
  return <span className={cls} style={style}>{children}</span>;
}

// Safe / Target / Reach chip — one consistent colour system everywhere.
export function ChanceChip({ bucket, label, pct, withDot = false }) {
  return (
    <span className="tag" style={chipStyle(bucket)}>
      {withDot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(bucket), marginRight: 6, display: 'inline-block' }} />}
      {label}{pct != null ? ` · ${pct}%` : ''}
    </span>
  );
}

// Type badge — IIT / NIT / IIIT / GFTI.
export function TypeBadge({ type }) {
  return <span className="tag" style={typeStyle(type)}>{type}</span>;
}

export function Avatar({ initials, color = 'var(--color-accent)', size = 44, fontSize }) {
  return (
    <span style={{ width: size, height: size, flex: 'none', borderRadius: '50%', background: color, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: fontSize || Math.round(size * 0.38) }}>
      {initials}
    </span>
  );
}

// Controlled field wrappers.
export function Field({ label, children, style = {} }) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Select({ children, ...props }) {
  return <select className="input" {...props}>{children}</select>;
}

// Segmented control option.
export function SegOpt({ on, children, ...rest }) {
  return (
    <label className={['seg-opt', on ? 'on' : ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </label>
  );
}
