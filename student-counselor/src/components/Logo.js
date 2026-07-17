'use client';
// The Student-Counselor brand mark: a "guiding star" compass inside a warm terracotta
// squircle — counselling points you to the right college (the north-star metaphor). One
// mark for the header, sidebar, footer, and the browser-tab favicon (src/app/icon.svg
// carries an identical, standalone copy). Scales crisply from a 16px favicon to hero size.
import { useId } from 'react';

export default function Logo({ size = 26, title = 'Student-Counselor' }) {
  // Unique gradient id per instance so multiple logos on one page don't collide.
  const gid = useId();
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none"
      role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flex: 'none' }}
    >
      <defs>
        <linearGradient id={gid} x1="16" y1="1" x2="16" y2="31" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dd8a52" />
          <stop offset="1" stopColor="#a8551f" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8.5" fill={`url(#${gid})`} />
      <path d="M16 4 Q19 13 27 16 Q19 19 16 28 Q13 19 5 16 Q13 13 16 4 Z" fill="#f7eeda" />
    </svg>
  );
}
