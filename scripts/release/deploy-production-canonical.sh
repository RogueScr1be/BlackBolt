#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EXPECTED_PROJECT="${BLACKBOLT_EXPECTED_PROJECT:-BlackBolt}"
EXPECTED_ENVIRONMENT="${BLACKBOLT_EXPECTED_ENVIRONMENT:-production}"
SERVICES=("blackbolt-api" "blackbolt-worker")
MODE=""
NON_INTERACTIVE="${CI:-0}"
GIT_BIN="${GIT_BIN:-git}"
RAILWAY_BIN="${RAILWAY_BIN:-railway}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/release/deploy-production-canonical.sh --help
  bash scripts/release/deploy-production-canonical.sh --dry-run
  bash scripts/release/deploy-production-canonical.sh --execute

Modes:
  --help     Print this usage text and exit with no side effects.
  --dry-run  Print the exact production deploy plan and exit with no side effects.
  --execute  Perform the real production deploy path.

Safety:
  - No arguments prints usage and exits with no side effects.
  - Unknown flags fail closed and print usage.
  - Real deploys require --execute.
  - Non-interactive execution is allowed only when CI=1 is set explicitly.
EOF
}

cd "$REPO_ROOT"

fail() {
  echo "[release] FAIL $1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --dry-run)
      [ -z "$MODE" ] || fail "choose only one mode: --dry-run or --execute"
      MODE="dry-run"
      ;;
    --execute)
      [ -z "$MODE" ] || fail "choose only one mode: --dry-run or --execute"
      MODE="execute"
      ;;
    *)
      usage >&2
      fail "unknown argument: $1"
      ;;
  esac
  shift
done

if [ -z "$MODE" ]; then
  usage
  exit 0
fi

run_or_print() {
  if [ "$MODE" = "dry-run" ]; then
    printf '[release] dry-run:'
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
    return 0
  fi

  "$@"
}

if ! command -v "$RAILWAY_BIN" >/dev/null 2>&1; then
  fail "railway CLI not installed or not on PATH"
fi

if ! command -v "$GIT_BIN" >/dev/null 2>&1; then
  fail "git not installed or not on PATH"
fi

WORKTREE_CLEAN="1"
if ! "$GIT_BIN" diff --quiet || ! "$GIT_BIN" diff --cached --quiet; then
  WORKTREE_CLEAN="0"
  if [ "$MODE" = "execute" ]; then
    fail "working tree must be clean before production deploy"
  fi
fi

STATUS_JSON="$("$RAILWAY_BIN" status --json)"
if [ -z "$STATUS_JSON" ]; then
  fail "railway status unavailable"
fi

STATUS_SUMMARY="$(printf '%s' "$STATUS_JSON" | node -e '
  let input = "";
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    try {
      const parsed = JSON.parse(input);
      const env = parsed.environments?.edges?.[0]?.node?.name ?? "";
      process.stdout.write(`${parsed.name ?? ""}\n${env}`);
    } catch {
      process.exit(1);
    }
  });
')"
PROJECT_NAME="$(printf '%s' "$STATUS_SUMMARY" | sed -n '1p')"
ENVIRONMENT_NAME="$(printf '%s' "$STATUS_SUMMARY" | sed -n '2p')"

if [ "$PROJECT_NAME" != "$EXPECTED_PROJECT" ]; then
  fail "linked Railway project is ${PROJECT_NAME}, expected ${EXPECTED_PROJECT}"
fi

if [ "$ENVIRONMENT_NAME" != "$EXPECTED_ENVIRONMENT" ]; then
  fail "linked Railway environment is ${ENVIRONMENT_NAME}, expected ${EXPECTED_ENVIRONMENT}"
fi

BUILD_SHA="$("$GIT_BIN" rev-parse HEAD)"
SHORT_SHA="$("$GIT_BIN" rev-parse --short HEAD)"
BRANCH_NAME="$("$GIT_BIN" rev-parse --abbrev-ref HEAD)"

echo "[release] mode=${MODE}"
echo "[release] branch=${BRANCH_NAME}"
echo "[release] sha=${BUILD_SHA}"
echo "[release] project=${PROJECT_NAME}"
echo "[release] environment=${ENVIRONMENT_NAME}"
echo "[release] services=${SERVICES[*]}"
if [ "$WORKTREE_CLEAN" = "0" ]; then
  echo "[release] warning=working tree is dirty; execute mode would fail until cleaned"
fi

if [ "$MODE" = "execute" ] && [ "$NON_INTERACTIVE" != "1" ]; then
  if [ ! -t 0 ]; then
    fail "non-interactive production deploy requires CI=1 with --execute"
  fi

  printf '[release] Type DEPLOY to confirm production deploy: '
  read -r confirmation
  if [ "$confirmation" != "DEPLOY" ]; then
    fail "confirmation not received; deploy aborted"
  fi
fi

echo "[release] using BUILD_SHA=${BUILD_SHA}"
run_or_print "$RAILWAY_BIN" variable set --service blackbolt-api "BUILD_SHA=${BUILD_SHA}" --skip-deploys
run_or_print "$RAILWAY_BIN" variable set --service blackbolt-worker "BUILD_SHA=${BUILD_SHA}" --skip-deploys

echo "[release] deploying blackbolt-api from canonical repo root"
run_or_print "$RAILWAY_BIN" up . --service blackbolt-api --path-as-root --detach --message "canonical api release ${SHORT_SHA}"

echo "[release] deploying blackbolt-worker from canonical repo root"
run_or_print "$RAILWAY_BIN" up . --service blackbolt-worker --path-as-root --detach --message "canonical worker release ${SHORT_SHA}"

if [ "$MODE" = "dry-run" ]; then
  echo "[release] dry-run complete; no deploy submitted"
  exit 0
fi

echo "[release] submitted canonical production deploys for SHA ${BUILD_SHA}"
echo "[release] next checks:"
echo "  railway deployment list --service blackbolt-api --limit 1 --json"
echo "  railway deployment list --service blackbolt-worker --limit 1 --json"
echo "  curl -sS https://blackbolt-api-production.up.railway.app/health"
