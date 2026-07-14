# Student-Counselor — Next.js UI

A faithful, front-end-only rebuild of the **Student-Counselor** design (the JEE/JoSAA
college **Predictor**, choice-list **Planner**, and mentor-call **Marketplace**), built
from the handoff design brief and interactive prototype.

- **No backend.** Everything runs client-side on in-memory dummy data taken straight
  from the design (`src/lib/data.js`).
- **~70 screens** across 6 groups: Marketing, Auth & Onboarding, Student app,
  Mentor app, Super Admin, and shared System states — all reachable from the
  **All screens** gallery at `/`.
- **Organic design system** ported 1:1 — cream/terracotta/sage tokens, Caprasimo
  display + Figtree body, over-rounded pills and cards (`src/app/globals.css`).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
# or a production build:
npm run build && npm run start
```

## The interactive bits (all live, no backend)

- **College Predictor** (`/predictor`) — edit your rank/category/home-state and the
  Safe/Target/Reach buckets, result count, and home-state quota recompute instantly.
- **Choice-List Builder** (`/choice-builder`) — drag rows to reorder; the **List
  Doctor** re-evaluates warnings (no Safe options, too few choices, reach-heavy,
  duplicates) as the list changes.
- **College Analysis** (`/college-detail`) — cutoff-trend chart with **your rank**
  marked as a dashed line.
- **1:1 Session Room** (`/session-room`) — live 25-minute timer, mic/cam toggles, chat.
- Toasts, confirm dialogs, the onboarding wizard, and every nav all work.

## How it's wired

| Concern | File |
| --- | --- |
| Dummy data (colleges, mentors, lists) | `src/lib/data.js` |
| Chance/decorate/filter/List-Doctor/chart logic | `src/lib/logic.js` |
| Screen ↔ URL slug map + role context | `src/lib/routes.js` |
| Shared app state + action dispatcher (React context) | `src/lib/store.js` |
| Layout chrome (top nav / sidebar / bottom nav / toast / dialog) | `src/components/Chrome.js` |
| Reusable UI primitives (Button, Tag, chips, badges, fields) | `src/components/ui.js` |
| Screens, grouped by role | `src/screens/*.js` |
| Screen registry | `src/screens/index.js` |
| Route (one optional catch-all → registry) | `src/app/[[...slug]]/page.js` |

Each screen has its own URL (e.g. `/predictor`, `/choice-builder`, `/m-dashboard`,
`/a-verify-queue`), while shared state lives in the root `AppProvider` so it persists
as you move between screens — the same behaviour as the original single-page prototype.

> Predictions are estimates from historical JoSAA data — not a guarantee. This is a
> UI demo with fabricated sample data; always verify on josaa.nic.in.
