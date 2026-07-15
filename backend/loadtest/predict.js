// k6 load test — the PUBLIC, CDN-cacheable predictor read (`GET {API}/predict`).
//
// HOW TO RUN
//   1. Install k6 (once):  https://k6.io/docs/get-started/installation/  (brew install k6)
//   2. Run against a deployed API:
//        k6 run -e API=https://7zumjbvms0.execute-api.ap-south-1.amazonaws.com loadtest/predict.js
//      Local dev server:
//        k6 run -e API=http://localhost:8788 loadtest/predict.js
//      Override the query if you want a different rank/category:
//        k6 run -e API=... -e ADV_RANK=1200 -e CATEGORY=Open loadtest/predict.js
//
// WHY THIS ENDPOINT (and why it stays CHEAP to hammer)
//   `GET /predict` is the one route safe to blast to 5k rps without racking up cost:
//     • PUBLIC — no Cognito authorizer, so no auth/JWT cost per request.
//     • READ-ONLY & SHARED — a prediction is a pure function of the query, identical
//       for every student with the same rank/category, so it is CDN-cacheable.
//     • NO PER-REQUEST DB COST — the catalog Lambda serves an in-memory snapshot of
//       the cutoff dataset loaded once on cold start (ADR-008, no Redis), so a replay
//       does NOT drive DynamoDB read units. CloudFront / HTTP-API caching absorbs the
//       repeats. Net: a full 5k-rps round-result spike costs cents, not dollars.
//   ⚠️  NEVER point a ramp like this at an authed/write route (`/bookings`, `/choice-list`,
//   `/notifications`): those hit the writer path + Cognito + DynamoDB writes and WOULD
//   spike cost. Load-test writes at a tiny fixed rate only. See docs/architecture.md §8.5.
//
// THRESHOLDS (the SLO this test enforces): p95 latency < 500ms, error rate < 1%.
// A failing threshold makes `k6 run` exit non-zero → wire it into CI/pre-season checks.

import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API || 'http://localhost:8788';

// A representative predictor query (JEE-Advanced rank 850, Open). Same query every
// iteration = cache-friendly, mirrors the real "everyone checks the same popular
// rank after results" spike. Params match services/catalog normalizeInput().
const ADV_RANK = __ENV.ADV_RANK || '850';
const CATEGORY = __ENV.CATEGORY || 'Open';
const HOME = __ENV.HOME || 'Delhi';

// Target peak rps (architecture §8.5 = 5k rps predictor). Override with -e TARGET_RPS=.
const TARGET_RPS = Number(__ENV.TARGET_RPS) || 5000;

export const options = {
  scenarios: {
    // Ramping arrival rate = open model: k6 holds the *request rate* regardless of how
    // slow responses get (the honest way to reproduce a spike; a closed VU model would
    // silently back off under latency).
    round_result_spike: {
      executor: 'ramping-arrival-rate',
      startRate: 50, // rps
      timeUnit: '1s',
      // TODO(owner): size preAllocatedVUs/maxVUs from observed p95 — you need roughly
      // TARGET_RPS × p95_seconds concurrent VUs. Start generous; k6 warns if short.
      preAllocatedVUs: 500,
      maxVUs: 2000,
      stages: [
        { target: 200, duration: '1m' },              // warm up
        { target: 1000, duration: '2m' },             // ramp toward peak
        { target: TARGET_RPS, duration: '2m' },       // climb to the round-result spike
        { target: TARGET_RPS, duration: '3m' },       // hold at peak rps
        { target: 0, duration: '1m' },                // ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // p95 under 500ms
    http_req_failed: ['rate<0.01'],   // <1% failed requests
  },
};

export default function () {
  const url = `${API}/predict?advRank=${ADV_RANK}&category=${encodeURIComponent(CATEGORY)}&home=${encodeURIComponent(HOME)}`;
  const res = http.get(url);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body has results': (r) => !!r.body && r.body.length > 0,
  });
  // Small pace so a single VU doesn't busy-spin; the arrival-rate executor controls rps.
  sleep(0.1);
}
