// ══════════════════════════════════════════════════════════════════════════
// Derived logic — ported from the prototype: Safe/Target/Reach chance, home-state
// quota, decoration, filtering/sorting, List Doctor, and cutoff-trend chart data.
// ══════════════════════════════════════════════════════════════════════════
import { COLLEGES } from './data';

// Consistent Safe / Target / Reach colour system used everywhere a chance shows.
export const REACH_BG = '#f7e2db';
export const REACH_FG = '#7a2d1a';
export const REACH_DOT = '#a8442e';

export function chipStyle(bucket) {
  if (bucket === 'safe') return { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' };
  if (bucket === 'target') return { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' };
  return { background: REACH_BG, color: REACH_FG };
}
export function dotColor(bucket) {
  return bucket === 'safe' ? '#728157' : bucket === 'target' ? '#d67f48' : REACH_DOT;
}
export function typeStyle(t) {
  if (t === 'IIT') return { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' };
  if (t === 'NIT') return { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' };
  if (t === 'IIIT') return { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)' };
  return { border: '1px solid var(--color-accent)', color: 'var(--color-accent-700)' };
}

function rankFor(c, profile) {
  return c.exam === 'adv' ? profile.advRank : profile.mainRank;
}

// Chance of admission from rank/closing-rank ratio, with home-state quota loosening.
export function chance(c, profile) {
  const rank = rankFor(c, profile);
  let close = c.close;
  if ((c.type === 'NIT' || c.type === 'GFTI') && c.state === profile.home) close = Math.round(close * 1.35);
  const ratio = rank / close;
  let bucket, label;
  if (ratio <= 0.9) { bucket = 'safe'; label = 'Safe'; }
  else if (ratio <= 1.15) { bucket = 'target'; label = 'Target'; }
  else { bucket = 'reach'; label = 'Reach'; }
  const pct = Math.max(8, Math.min(97, Math.round(102 - (ratio - 0.55) * 62)));
  return { ratio, bucket, label, pct, effClose: close };
}

// Attach all the display-ready fields the cards/screens read.
export function decorate(c, profile) {
  const ch = chance(c, profile);
  return {
    ...c,
    ...ch,
    rankUsed: rankFor(c, profile),
    examLabel: c.exam === 'adv' ? 'JEE Adv' : 'JEE Main',
    chipStyle: chipStyle(ch.bucket),
    dotColor: dotColor(ch.bucket),
    typeStyle: typeStyle(c.type),
    feesTxt: '₹' + c.fees + 'L total',
    avgTxt: '₹' + c.avg + ' LPA',
    homeQuota: (c.type === 'NIT' || c.type === 'GFTI') && c.state === profile.home,
  };
}

export function byId(id, profile) {
  return decorate(COLLEGES.find((c) => c.id === id), profile);
}

// Filtered + sorted predictor results.
export function results(profile, filters) {
  let list = COLLEGES.map((c) => decorate(c, profile)).filter((c) => c.ratio <= 1.6);
  list = list.filter((c) => filters.types.includes(c.type));
  if (filters.branch !== 'all') list = list.filter((c) => c.branch === filters.branch);
  if (filters.state !== 'all') list = list.filter((c) => c.state === filters.state);
  if (filters.q.trim()) {
    const q = filters.q.toLowerCase();
    list = list.filter((c) => (c.college + ' ' + c.branch + ' ' + c.city).toLowerCase().includes(q));
  }
  if (filters.sort === 'chance') list.sort((a, b) => b.pct - a.pct);
  else if (filters.sort === 'ranking') list.sort((a, b) => (a.nirf || 99) - (b.nirf || 99));
  else if (filters.sort === 'closing') list.sort((a, b) => a.close - b.close);
  else if (filters.sort === 'location') list.sort((a, b) => a.city.localeCompare(b.city));
  return list;
}

// List Doctor — warnings about the current choice list.
export function listDoctor(choiceItems, choiceList) {
  const clSafe = choiceItems.filter((c) => c.bucket === 'safe').length;
  const topReach = choiceItems.slice(0, 3).filter((c) => c.bucket === 'reach').length;
  const dupes = choiceItems.length - new Set(choiceList).size;
  const doctor = [];
  if (clSafe === 0) doctor.push({ sev: 'high', t: 'No Safe colleges', d: 'Add at least 2–3 Safe options so you’re never left unallotted.' });
  if (choiceItems.length < 6) doctor.push({ sev: 'med', t: 'Too few choices', d: 'Aspirants usually fill 15–40 choices. You have ' + choiceItems.length + '.' });
  if (topReach >= 2) doctor.push({ sev: 'med', t: 'Reach-heavy at the top', d: 'Your first few choices are mostly Reach. That’s fine only if you’re okay skipping a round.' });
  if (dupes > 0) doctor.push({ sev: 'high', t: 'Duplicate choices', d: 'You have ' + dupes + ' duplicate college-branch rows.' });
  if (doctor.length === 0) doctor.push({ sev: 'ok', t: 'List looks healthy', d: 'Good spread of Safe, Target and Reach. You’re ready to lock.' });
  const sevMap = { high: { color: REACH_DOT, icon: '⚠' }, med: { color: '#d67f48', icon: '!' }, ok: { color: '#728157', icon: '✔' } };
  return doctor.map((w) => ({ ...w, color: sevMap[w.sev].color, icon: sevMap[w.sev].icon }));
}

// Cutoff-trend chart geometry (5 years) with the student's rank marked.
export function chartData(c, profile) {
  const years = ['2021', '2022', '2023', '2024', '2025'];
  const base = c.close;
  const vals = [Math.round(base * 1.18), Math.round(base * 1.05), Math.round(base * 0.92), Math.round(base * 1.02), base];
  const W = 520, H = 200, pad = 34;
  const rank = rankFor(c, profile);
  const max = Math.max(...vals, rank) * 1.1;
  const min = 0;
  const x = (i) => pad + i * ((W - pad * 2) / (years.length - 1));
  const y = (v) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const points = vals.map((v, i) => x(i) + ',' + y(v)).join(' ');
  return {
    W, H, pad, years, vals, points,
    dots: vals.map((v, i) => ({ cx: x(i), cy: y(v), v, tx: x(i), ty: y(v) - 11 })),
    yearLabels: years.map((yr, i) => ({ x: x(i), y: H - pad + 16, yr })),
    rankY: y(rank),
    rank,
  };
}
