#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-general}"
CANONICAL_ROOT_DEFAULT="/Users/thewhitley/.codex/worktrees/749b/New project"
CANONICAL_ROOT="${BLACKBOLT_CANONICAL_ROOT:-$CANONICAL_ROOT_DEFAULT}"
EXPECTED_PROJECT="${BLACKBOLT_EXPECTED_PROJECT:-BlackBolt}"
EXPECTED_ENVIRONMENT="${BLACKBOLT_EXPECTED_ENVIRONMENT:-production}"
CURRENT_DIR="$(pwd -P)"

print_remediation() {
  echo "[preflight:${MODE}] remediation:"
  echo "  1) cd \"$CANONICAL_ROOT\""
  echo "  2) npm run"
  echo "  3) railway link   # select project=${EXPECTED_PROJECT} environment=${EXPECTED_ENVIRONMENT}"
  echo "  4) railway status"
  echo "  5) rerun rollout command"
}

fail() {
  local message="$1"
  echo "[preflight:${MODE}] FAIL ${message}"
  print_remediation
  exit 1
}

run_with_retry() {
  local attempts="$1"
  local delay_seconds="$2"
  shift 2

  local output=""
  local attempt=1
  while [ "$attempt" -le "$attempts" ]; do
    if output="$("$@" 2>/dev/null)"; then
      printf '%s' "$output"
      return 0
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -le "$attempts" ]; then
      sleep "$delay_seconds"
    fi
  done

  return 1
}

if [ "$CURRENT_DIR" != "$CANONICAL_ROOT" ]; then
  fail "wrong repo context current_dir=${CURRENT_DIR} expected_dir=${CANONICAL_ROOT}"
fi

if [ ! -f "package.json" ]; then
  fail "package.json not found in current directory"
fi

MISSING_SCRIPTS="$(
  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const scripts = pkg.scripts ?? {};
    const required = [
      "objective:rollout:preflight",
      "objective:rollout:shadow",
      "objective:rollout:live",
      "objective:rollout:stabilize"
    ];
    const missing = required.filter((name) => !(name in scripts));
    process.stdout.write(missing.join(","));
  ' 2>/dev/null || true
)"

if [ -z "$MISSING_SCRIPTS" ]; then
  :
else
  fail "required npm scripts missing: ${MISSING_SCRIPTS}"
fi

if ! command -v railway >/dev/null 2>&1; then
  fail "railway CLI not installed or not on PATH"
fi

STATUS_OUTPUT="$(run_with_retry 3 2 railway status || true)"
if [ -z "$STATUS_OUTPUT" ]; then
  fail "railway status unavailable (network/auth/project link issue)"
fi

if ! printf '%s\n' "$STATUS_OUTPUT" | grep -qE "^[[:space:]]*Project:[[:space:]]*${EXPECTED_PROJECT}[[:space:]]*$"; then
  echo "$STATUS_OUTPUT"
  fail "railway project context is not ${EXPECTED_PROJECT}"
fi

if ! printf '%s\n' "$STATUS_OUTPUT" | grep -qE "^[[:space:]]*Environment:[[:space:]]*${EXPECTED_ENVIRONMENT}[[:space:]]*$"; then
  echo "$STATUS_OUTPUT"
  fail "railway environment context is not ${EXPECTED_ENVIRONMENT}"
fi

for service in blackbolt-api blackbolt-worker; do
  SERVICE_VARS="$(run_with_retry 3 2 railway variable list --service "$service" --json || true)"
  if [ -z "$SERVICE_VARS" ]; then
    fail "service not resolvable in current railway context: ${service}"
  fi
done

echo "[preflight:${MODE}] OK repo + scripts + railway context verified"
