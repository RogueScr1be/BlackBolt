#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

FAKE_BIN="$TMP_DIR/bin"
FAKE_LOG="$TMP_DIR/railway.log"
mkdir -p "$FAKE_BIN"

cat > "$FAKE_BIN/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "diff --quiet"|"diff --cached --quiet")
    exit 0
    ;;
  "rev-parse HEAD")
    printf '1111111111111111111111111111111111111111\n'
    ;;
  "rev-parse --short HEAD")
    printf '1111111\n'
    ;;
  "rev-parse --abbrev-ref HEAD")
    printf 'codex/test-release-script\n'
    ;;
  *)
    printf 'unexpected git invocation: %s\n' "$*" >&2
    exit 1
    ;;
esac
EOF

cat > "$FAKE_BIN/railway" <<EOF
#!/usr/bin/env bash
set -euo pipefail
LOG_FILE="$FAKE_LOG"
if [ "\${1:-}" = "status" ] && [ "\${2:-}" = "--json" ]; then
  cat <<'JSON'
{"name":"BlackBolt","environments":{"edges":[{"node":{"name":"production"}}]}}
JSON
  exit 0
fi
printf '%s\n' "\$*" >> "\$LOG_FILE"
exit 0
EOF

chmod +x "$FAKE_BIN/git" "$FAKE_BIN/railway"

SCRIPT_PATH="$REPO_ROOT/scripts/release/deploy-production-canonical.sh"

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    printf 'expected output to contain: %s\n' "$needle" >&2
    exit 1
  fi
}

assert_no_railway_side_effects() {
  if [ -f "$FAKE_LOG" ] && [ -s "$FAKE_LOG" ]; then
    printf 'expected no railway side effects, saw:\n' >&2
    cat "$FAKE_LOG" >&2
    exit 1
  fi
}

assert_log_contains() {
  local needle="$1"
  if ! grep -Fq "$needle" "$FAKE_LOG"; then
    printf 'expected railway log to contain: %s\n' "$needle" >&2
    cat "$FAKE_LOG" >&2
    exit 1
  fi
}

assert_log_not_contains() {
  local needle="$1"
  if [ -f "$FAKE_LOG" ] && grep -Fq "$needle" "$FAKE_LOG"; then
    printf 'did not expect railway log to contain: %s\n' "$needle" >&2
    cat "$FAKE_LOG" >&2
    exit 1
  fi
}

run_case() {
  local expected_exit="$1"
  shift
  set +e
  local output
  output="$(PATH="$FAKE_BIN:$PATH" GIT_BIN=git RAILWAY_BIN=railway CI="${CI:-}" "$SCRIPT_PATH" "$@" 2>&1)"
  local status=$?
  set -e
  if [ "$status" -ne "$expected_exit" ]; then
    printf 'unexpected exit %s for args %s\n%s\n' "$status" "$*" "$output" >&2
    exit 1
  fi
  printf '%s' "$output"
}

help_output="$(run_case 0 --help)"
assert_contains "$help_output" "Usage:"
assert_no_railway_side_effects

no_arg_output="$(run_case 0)"
assert_contains "$no_arg_output" "Usage:"
assert_no_railway_side_effects

unknown_output="$(run_case 1 --not-a-real-flag)"
assert_contains "$unknown_output" "unknown argument"
assert_no_railway_side_effects

dry_run_output="$(run_case 0 --dry-run)"
assert_contains "$dry_run_output" "mode=dry-run"
assert_contains "$dry_run_output" "dry-run complete; no deploy submitted"
assert_no_railway_side_effects
assert_contains "$dry_run_output" "dry-run: railway variable set --service blackbolt-api"
assert_contains "$dry_run_output" "dry-run: railway up . --service blackbolt-api"
: > "$FAKE_LOG"

non_interactive_output="$(run_case 1 --execute)"
assert_contains "$non_interactive_output" "non-interactive production deploy requires CI=1 with --execute"
: > "$FAKE_LOG"

execute_output="$(CI=1 run_case 0 --execute)"
assert_contains "$execute_output" "mode=execute"
assert_log_contains "variable set --service blackbolt-api BUILD_SHA=1111111111111111111111111111111111111111 --skip-deploys"
assert_log_contains "variable set --service blackbolt-worker BUILD_SHA=1111111111111111111111111111111111111111 --skip-deploys"
assert_log_contains "up . --service blackbolt-api --path-as-root --detach --message canonical api release 1111111"
assert_log_contains "up . --service blackbolt-worker --path-as-root --detach --message canonical worker release 1111111"

printf 'release script safety checks passed\n'
