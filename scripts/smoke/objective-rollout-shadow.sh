#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 4 ] || [ "$#" -gt 6 ]; then
  echo "Usage: bash scripts/smoke/objective-rollout-shadow.sh <apiBaseUrl> <tenantId> <operatorKey> <expectedBuildSha> [authHeaderOrDash] [month]"
  exit 64
fi

API_BASE_URL="${1%/}"
TENANT_ID="$2"
OPERATOR_KEY="$3"
EXPECTED_SHA="$4"
AUTH_INPUT="${5:--}"
MONTH_INPUT="${6:-$(date -u +%Y-%m)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
READINESS_ATTEMPTS="${OBJECTIVE_READINESS_ATTEMPTS:-20}"
READINESS_SLEEP_SECONDS="${OBJECTIVE_READINESS_SLEEP_SECONDS:-10}"

cd "$REPO_ROOT"
bash "${SCRIPT_DIR}/objective-rollout-preflight.sh" "shadow"

auth_header() {
  local input="$1"
  if [ "$input" = "-" ]; then
    return 0
  fi
  if [[ "$input" == Basic\ * ]] || [[ "$input" == Bearer\ * ]]; then
    printf "%s" "$input"
    return 0
  fi
  if [[ "$input" == *" "* ]]; then
    printf "%s" "$input"
    return 0
  fi
  local b64
  b64="$(printf "%s" "$input" | base64 | tr -d '\n')"
  printf "Basic %s" "$b64"
}

AUTH_HEADER="$(auth_header "$AUTH_INPUT")"

print_latest_deployments() {
  if ! command -v railway >/dev/null 2>&1; then
    return
  fi

  for service in blackbolt-api blackbolt-worker; do
    local deployments_json
    deployments_json="$(railway deployment list --service "$service" --json 2>/dev/null || true)"
    if [ -z "$deployments_json" ]; then
      continue
    fi
    local summary
    summary="$(printf '%s' "$deployments_json" | node -e '
      let input = "";
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        try {
          const parsed = JSON.parse(input);
          const items = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.deployments)
              ? parsed.deployments
              : [];
          if (items.length === 0) return;
          const first = items[0] ?? {};
          const id = first.id ?? first.deploymentId ?? "unknown";
          const status = first.status ?? first.state ?? "unknown";
          process.stdout.write(`${id} status=${status}`);
        } catch {}
      });
    ' 2>/dev/null || true)"
    if [ -n "$summary" ]; then
      echo "[rollout-shadow] latest ${service} deployment ${summary}"
    fi
  done
}

wait_for_readiness() {
  local attempt=1
  while [ "$attempt" -le "$READINESS_ATTEMPTS" ]; do
    local health_code
    health_code="$(curl -sS -o /dev/null -w "%{http_code}" "${API_BASE_URL}/health" || true)"

    local -a smoke_headers
    smoke_headers=(-H "x-tenant-id: ${TENANT_ID}" -H "x-operator-key: ${OPERATOR_KEY}" -H "x-user-id: objective-rollout-readiness" -H "content-type: application/json")
    if [ -n "$AUTH_HEADER" ]; then
      smoke_headers+=(-H "Authorization: ${AUTH_HEADER}")
    fi

    local smoke_code
    smoke_code="$(
      curl -sS -o /dev/null -w "%{http_code}" \
        -X POST \
        "${smoke_headers[@]}" \
        --data '{}' \
        "${API_BASE_URL}/v1/tenants/${TENANT_ID}/operator/smoke" || true
    )"

    if [ "$health_code" = "200" ] && { [ "$smoke_code" = "200" ] || [ "$smoke_code" = "201" ]; }; then
      echo "[rollout-shadow] readiness OK health=${health_code} smoke=${smoke_code} attempt=${attempt}/${READINESS_ATTEMPTS}"
      return 0
    fi

    echo "[rollout-shadow] readiness pending attempt=${attempt}/${READINESS_ATTEMPTS} health=${health_code:-n/a} smoke=${smoke_code:-n/a}"
    attempt=$((attempt + 1))
    if [ "$attempt" -le "$READINESS_ATTEMPTS" ]; then
      sleep "$READINESS_SLEEP_SECONDS"
    fi
  done

  echo "[rollout-shadow] FAIL readiness not reached after ${READINESS_ATTEMPTS} attempts (sleep ${READINESS_SLEEP_SECONDS}s)"
  print_latest_deployments
  echo "[rollout-shadow] remediation:"
  echo "  railway logs --service blackbolt-api"
  echo "  railway logs --service blackbolt-worker"
  echo "  npm run objective:rollout:shadow -- \"$API_BASE_URL\" \"$TENANT_ID\" \"$OPERATOR_KEY\" \"$EXPECTED_SHA\" \"$AUTH_INPUT\" \"$MONTH_INPUT\""
  exit 1
}

read_service_vars_json() {
  local service="$1"
  local output
  output="$(railway variable list --service "$service" --json 2>/dev/null || true)"
  if [ -z "$output" ]; then
    return 1
  fi
  printf '%s' "$output"
}

read_var_value() {
  local vars_json="$1"
  local key="$2"
  printf '%s' "$vars_json" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      try {
        const vars = JSON.parse(input);
        const value = vars[process.argv[1]];
        if (value === undefined || value === null) {
          process.exit(2);
          return;
        }
        process.stdout.write(String(value));
      } catch {
        process.exit(3);
      }
    });
  ' "$key" 2>/dev/null || true
}

check_var() {
  local service="$1"
  local key="$2"
  local expected="$3"
  local vars_json
  if ! vars_json="$(read_service_vars_json "$service")"; then
    echo "[rollout-shadow] FAIL railway variable list unavailable for service=${service}"
    exit 1
  fi
  local value
  value="$(read_var_value "$vars_json" "$key")"
  if [ -z "$value" ]; then
    echo "[rollout-shadow] FAIL missing ${key} on service=${service}"
    exit 1
  fi
  if [ "$value" != "$expected" ]; then
    echo "[rollout-shadow] FAIL ${service} ${key} expected ${expected}"
    echo "[rollout-shadow] observed ${service} ${key}=${value}"
    exit 1
  fi
  echo "[rollout-shadow] OK   ${service} ${key}=${expected}"
}

check_scheduler_enabled() {
  local vars_json
  if ! vars_json="$(read_service_vars_json "blackbolt-worker")"; then
    echo "[rollout-shadow] FAIL railway variable list unavailable for service=blackbolt-worker"
    exit 1
  fi

  local scheduler_value
  scheduler_value="$(read_var_value "$vars_json" "GBP_POLL_SCHEDULER_DISABLED")"
  if [ -z "$scheduler_value" ]; then
    echo "[rollout-shadow] OK   blackbolt-worker GBP_POLL_SCHEDULER_DISABLED unset (treated enabled)"
    return
  fi
  if [ "$scheduler_value" = "1" ]; then
    echo "[rollout-shadow] FAIL scheduler disabled on worker (GBP_POLL_SCHEDULER_DISABLED=1)"
    exit 1
  fi
  echo "[rollout-shadow] OK   blackbolt-worker GBP_POLL_SCHEDULER_DISABLED=${scheduler_value}"
}

if command -v railway >/dev/null 2>&1; then
  check_var "blackbolt-api" "BUILD_SHA" "$EXPECTED_SHA"
  check_var "blackbolt-worker" "BUILD_SHA" "$EXPECTED_SHA"
  check_var "blackbolt-api" "POSTMARK_SEND_DISABLED" "1"
  check_var "blackbolt-worker" "POSTMARK_SEND_DISABLED" "1"
  check_scheduler_enabled
else
  echo "[rollout-shadow] WARN railway CLI not found; skipping env precondition checks"
fi

wait_for_readiness
bash "${SCRIPT_DIR}/objective-shadow-verify.sh" "$API_BASE_URL" "$TENANT_ID" "$OPERATOR_KEY" "$AUTH_INPUT" "$MONTH_INPUT"
echo "[rollout-shadow] Gate B PASS"
