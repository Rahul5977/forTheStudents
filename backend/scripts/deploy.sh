#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/deploy.sh — guarded CDK deploy helper (Phase 10, Go-live & Seasonal Ops)
#
# What it does:
#   1. Prints the CDK stack list for the chosen stage (a dry look before you deploy).
#   2. Deploys ALL stacks for that stage with `--require-approval never`.
#   3. REFUSES to touch `prod` unless you pass `--confirm` (a deliberate speed bump).
#
# Usage:
#   scripts/deploy.sh dev
#   scripts/deploy.sh staging
#   scripts/deploy.sh prod --confirm
#   scripts/deploy.sh dev --list-only        # just synth+list, no deploy
#
# Notes:
#   • Run from the repo root (or anywhere — it cd's to the infra package itself).
#   • Cost-safe: this only wraps `cdk deploy`; the stacks decide what gets created.
#     Season-gated stacks (WAF, warmers, provisioned concurrency) stay OFF unless their
#     `cfg.*` flags are set — see infra/lib/config.ts and docs/go-live.md.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Resolve the infra dir relative to this script so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/../infra" && pwd)"

STAGE="${1:-}"
CONFIRM="no"
LIST_ONLY="no"

# Parse remaining flags (order-independent).
shift || true
for arg in "$@"; do
  case "$arg" in
    --confirm)   CONFIRM="yes" ;;
    --list-only) LIST_ONLY="yes" ;;
    *) echo "✖ Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ -z "$STAGE" ]]; then
  echo "Usage: scripts/deploy.sh <dev|staging|prod> [--confirm] [--list-only]" >&2
  exit 2
fi

case "$STAGE" in
  dev|staging|prod) ;;
  *) echo "✖ Invalid stage '$STAGE' (expected dev|staging|prod)" >&2; exit 2 ;;
esac

# ── prod guard: a second pair of eyes before touching production ──────────────
if [[ "$STAGE" == "prod" && "$CONFIRM" != "yes" ]]; then
  echo "✖ Refusing to deploy to PROD without --confirm." >&2
  echo "  This deploys real, user-facing infrastructure. If you mean it:" >&2
  echo "    scripts/deploy.sh prod --confirm" >&2
  echo "  (See the go/no-go checklist in docs/go-live.md first.)" >&2
  exit 3
fi

cd "$INFRA_DIR"

echo "▸ Stage:        $STAGE"
echo "▸ Infra dir:    $INFRA_DIR"
echo "▸ Stacks for this stage:"
# `cdk list` synths and prints every stack that would be deployed.
pnpm exec cdk list --context "stage=${STAGE}" | sed 's/^/    - /'

if [[ "$LIST_ONLY" == "yes" ]]; then
  echo "✓ --list-only: not deploying."
  exit 0
fi

if [[ "$STAGE" == "prod" ]]; then
  echo "▸ PROD deploy confirmed (--confirm). Proceeding…"
fi

echo "▸ Deploying all stacks for '$STAGE' (--require-approval never)…"
pnpm exec cdk deploy --all --require-approval never --context "stage=${STAGE}"

echo "✓ Deploy complete for stage '$STAGE'."
echo "  Next: verify the CloudWatch dashboard 'sc-${STAGE}' and the smoke checks in docs/go-live.md."
