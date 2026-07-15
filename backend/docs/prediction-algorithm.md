# Prediction Algorithm — Safe / Target / Reach

> The exact algorithm the **predictor** (`@sc/catalog-core`) uses, so the docs sit
> side-by-side with the code. Implementation: `packages/catalog-core/src/predict.ts`
> (+ `parse.ts`, `enrich.ts`). Data: official **JoSAA 2024** opening/closing ranks.

## 0. Inputs
| Input | From | Notes |
|---|---|---|
| `advRank` | student profile | JEE **Advanced** category rank (for IITs) |
| `mainRank` | student profile | JEE **Main** category rank (for NIT/IIIT/GFTI) |
| `category` | profile | OPEN / EWS / OBC-NCL / SC / ST (the JoSAA *Seat Type*) |
| `home` | profile | home **state** — drives Home-State quota |
| `gender` | profile | `Gender-Neutral` (default) or `Female-only` pool |
| `types`, `q`, `sort` | predictor filters | institute types, search text, sort order |

## 1. Dataset (compute-not-query)
Each **cutoff** row = one `(institute, program, quota, seatType, gender)` with an
**opening rank** and **closing rank**. The full active snapshot (~11k rows) is loaded
from DynamoDB into Lambda memory **once per cold start** and reused across warm
invocations — the predictor never scans the DB per request. Each row is enriched at
ingest with `{ short, city, state, nirf, feesLakh }`.

## 2. The algorithm

```
predict(rank inputs, category, home, gender, filters):
  cat  = uppercase(category)                       # 'OPEN' | 'EWS' | ...
  pool = gender                                    # 'Gender-Neutral' (default)

  # (a) FILTER to the caller's competition set
  rows = cutoffs where
           seatType == cat AND gender == pool
           AND quota in {AI, HS, OS}               # (GO/JK/LA special quotas ignored)
           AND type in filters.types

  # (b) QUOTA SELECTION — one applicable closing rank per institute+program
  for each group (institute, program):
      if an AI row exists            -> use AI            # central institutes (IIT/IIIT/GFTI)
      elif an HS row exists AND institute.state == home
                                     -> use HS  (homeQuota=true)   # home-state advantage (easier)
      elif an OS row exists          -> use OS            # other-state applicant
      close = chosen.closingRank

  # (c) EXAM MAPPING — which rank to compare
      rank = (type == IIT) ? advRank : mainRank    # IITs via JEE Advanced; others via JEE Main

  # (d) CHANCE
      ratio = rank / close
      bucket = ratio <= 0.80 -> Safe               # you clear the cutoff by ≥20% — dependable
               ratio <= 1.10 -> Target             # around the line — a fair shot
               else          -> Reach              # your rank is worse than the cutoff — a stretch
      pct = clamp( round(100 - (ratio - 0.30) * 60), 6, 98 )   # a friendly 6..98% confidence

  # (e) REALISTIC WINDOW, SEARCH, SORT
  keep rows with 0.2 <= ratio <= 1.6                # hide hopeless reaches AND pointless over-safe
                                                    #   (closing > 5× your rank = far below your level)
  if q: keep rows whose institute/program contains q
  sort: 'best' (DEFAULT) -> close asc, then NIRF asc (nulls last), then pct desc   # BEST colleges first
        'chance'/'safest'-> pct desc, then close asc                               # safest first (opt-in)
        'closing'        -> close asc
        'location'       -> name asc

  return { results, safeCount, targetCount, reachCount }
```

### Why these numbers
- **Ordering is the whole point.** JoSAA allots you the *highest choice you clear*, so you must list the **best college you can plausibly get first**. The default `'best'` sort is therefore **closing rank ascending** (most-competitive first), NIRF as tiebreaker. Sorting by chance% (the old default) floated the *weakest* colleges — the ones you're trivially safe for — to the top; a rank-6000 student saw a closing-9000 backup as their #1. Now the #1 is the strongest reachable college and safe backups sit lower.
- **Thresholds 0.80 / 1.10** map the rank-vs-cutoff ratio to buckets: clear-it-comfortably, near-the-line, above-the-line.
- **Window `0.2 ≤ ratio ≤ 1.6`**: above 1.6 is realistically unattainable; below 0.2 (closing > 5× your rank) is a college so far beneath your level that nobody choice-fills it. Genuine safe backups (ratio 0.2–0.8) always survive.
- **`pct = 100 − (ratio − 0.30)·60`** is a smooth, monotonically-decreasing map to a 6–98% band (0.2→98%, 1.0→58%, 1.6→22%). A **communication aid**, not a calibrated probability.
- **Home-state matching is normalized** (case/whitespace/punctuation-insensitive, `&`↔`and`) so "Tamil Nadu" / "tamil nadu" / "Jammu & Kashmir" all match the institute's state → the HS (home-state) closing rank is used for that student.

## 3. Worked example
Student: JEE-Adv rank **850**, Open, home **Maharashtra**.
- **IIT Indore CSE** — closing (AI, OPEN) = **1567**. ratio = 850/1567 = 0.54 → **Safe**, pct ≈ 97%.
- **VNIT Nagpur CSE** (Maharashtra) — student is home-state → uses **HS** closing (7583, easier) not OS (9858); ratio uses `mainRank`.
- **IIT Bombay CSE** — closing = **67**. ratio = 850/67 = 12.7 → dropped (> 1.6).

## 4. Honesty & limits (by design)
- Ranks are **official JoSAA 2024** — an **estimate for the coming season, not a guarantee**. The UI always says "verify on josaa.nic.in".
- **Consolidated final round** (not per-round history yet).
- **AI/HS/OS** quotas modelled; GO/JK/LA special quotas and **PwD**/supernumerary sub-pools are not yet surfaced.
- `nirf`/`feesLakh` are curated for major institutes + type-based approximations for the tail (see `enrich.ts`).

## 5. Roadmap
Per-round trends · PwD & special quotas · calibrated probabilities from historical
allotment data · institute→state map for **all** GFTIs (currently curated for IITs/NITs).
