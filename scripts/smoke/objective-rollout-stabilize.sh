#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 5 ] || [ "$#" -gt 7 ]; then
  echo "Usage: bash scripts/smoke/objective-rollout-stabilize.sh <apiBaseUrl> <tenantId> <operatorKey> <durationMinutes> <intervalMinutes> [authHeaderOrDash] [month]"
  exit 64
fi

API_BASE_URL="${1%/}"
TENANT_ID="$2"
OPERATOR_KEY="$3"
DURATION_MINUTES="$4"
INTERVAL_MINUTES="$5"
AUTH_INPUT="${6:--}"
MONTH_INPUT="${7:-$(date -u +%Y-%m)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "$REPO_ROOT"
bash "${SCRIPT_DIR}/objective-rollout-preflight.sh" "stabilize"

if ! [[ "$DURATION_MINUTES" =~ ^[0-9]+$ ]] || ! [[ "$INTERVAL_MINUTES" =~ ^[0-9]+$ ]]; then
  echo "[stabilize] FAIL durationMinutes/intervalMinutes must be integers"
  exit 1
fi

if [ "$DURATION_MINUTES" -le 0 ] || [ "$INTERVAL_MINUTES" -le 0 ]; then
  echo "[stabilize] FAIL durationMinutes/intervalMinutes must be > 0"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

auth_header() {
  local input="$1"
  if [ "$input" = "-" ]; then
    return 0
  fi
  if [[ "$input" == Basic\ * ]] || [[ "$input" == Bearer\ * ]]; then
    printf "%s" "$input"
    return 0
  fi
  local b64
  b64="$(printf "%s" "$input" | base64 | tr -d '\n')"
  printf "Basic %s" "$b64"
}

AUTH_HEADER="$(auth_header "$AUTH_INPUT")"

call() {
  local name="$1"
  local method="$2"
  local url="$3"
  local outfile="${TMP_DIR}/${name}.json"
  local -a headers
  headers=(-H "x-tenant-id: ${TENANT_ID}" -H "x-operator-key: ${OPERATOR_KEY}" -H "x-user-id: objective-stabilize")
  if [ -n "$AUTH_HEADER" ]; then
    headers+=(-H "Authorization: ${AUTH_HEADER}")
  fi
  local code
  code="$(curl -sS -o "$outfile" -w "%{http_code}" -X "$method" "${headers[@]}" "$url")"
  echo "$code"
}

check_checkpoint() {
  local idx="$1"
  local health_code alerts_code report_code
  health_code="$(call "health-${idx}" "GET" "${API_BASE_URL}/health")"
  alerts_code="$(call "alerts-${idx}" "GET" "${API_BASE_URL}/alerts?state=open")"
  report_code="$(call "report-${idx}" "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/reports/monthly?month=${MONTH_INPUT}")"

  if [ "$health_code" != "200" ] || [ "$alerts_code" != "200" ] || [ "$report_code" != "200" ]; then
    echo "[stabilize] FAIL checkpoint=${idx} HTTP health=${health_code} alerts=${alerts_code} report=${report_code}"
    exit 1
  fi

  node - "$TMP_DIR" "$idx" <<'NODE'
const fs = require('fs');
const dir = process.argv[2];
const idx = process.argv[3];
const health = JSON.parse(fs.readFileSync(`${dir}/health-${idx}.json`, 'utf8'));
const alerts = JSON.parse(fs.readFileSync(`${dir}/alerts-${idx}.json`, 'utf8'));
const report = JSON.parse(fs.readFileSync(`${dir}/report-${idx}.json`, 'utf8'));
const failures = [];
if (health?.ok !== true) failures.push('health.ok is false');
if (health?.checks?.worker_heartbeat !== true) failures.push('worker heartbeat is not healthy');
const criticalOpen = (alerts.items ?? []).filter((a) => a.state === 'open' && a.severity === 'critical').length;
if (criticalOpen > 0) failures.push(`critical open alerts=${criticalOpen}`);
const totals = report.totals ?? {};
const sent = Number(totals.sent_count ?? totals.sentCount ?? 0);
const runs = Number(totals.run_count ?? totals.runCount ?? 0);
if (sent < 0 || runs < 0) failures.push('report totals invalid');
if (failures.length > 0) {
  console.log(`[stabilize] checkpoint=${idx} FAIL ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`[stabilize] checkpoint=${idx} OK health+alerts+report coherent`);
NODE
}

total_seconds=$((DURATION_MINUTES * 60))
interval_seconds=$((INTERVAL_MINUTES * 60))
checkpoints=$(((total_seconds + interval_seconds - 1) / interval_seconds))

echo "[stabilize] starting window duration=${DURATION_MINUTES}m interval=${INTERVAL_MINUTES}m checkpoints=${checkpoints}"
for i in $(seq 1 "$checkpoints"); do
  check_checkpoint "$i"
  if [ "$i" -lt "$checkpoints" ]; then
    sleep "$interval_seconds"
  fi
done

echo "[stabilize] PASS no unresolved critical alerts and health/report checks stayed coherent"
echo "[stabilize] rollback commands (if needed):"
echo "railway variable set POSTMARK_SEND_DISABLED=1 --service blackbolt-api"
echo "railway variable set POSTMARK_SEND_DISABLED=1 --service blackbolt-worker"
echo "railway redeploy --service blackbolt-api"
echo "railway redeploy --service blackbolt-worker"
