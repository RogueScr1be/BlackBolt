#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: bash scripts/smoke/railway-smoke.sh <apiBaseUrl> <tenantId> <basicAuthOrDash>"
  echo "Example: bash scripts/smoke/railway-smoke.sh https://api.blackbolt.example tenant-demo operator:secret"
  echo "Use '-' for <basicAuthOrDash> when no Authorization header is required."
  exit 64
fi

API_BASE_URL="${1%/}"
TENANT_ID="$2"
BASIC_AUTH_INPUT="$3"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

AUTH_HEADER=""
if [ "$BASIC_AUTH_INPUT" != "-" ]; then
  if [[ "$BASIC_AUTH_INPUT" == Basic\ * ]]; then
    AUTH_HEADER="$BASIC_AUTH_INPUT"
  else
    BASIC_AUTH_B64="$(printf "%s" "$BASIC_AUTH_INPUT" | base64 | tr -d '\n')"
    AUTH_HEADER="Basic ${BASIC_AUTH_B64}"
  fi
fi

request() {
  local method="$1"
  local url="$2"
  local expected="$3"
  local body_file="$4"

  local -a headers
  headers=(-H "x-tenant-id: ${TENANT_ID}" -H "x-user-id: smoke")
  if [ -n "$AUTH_HEADER" ]; then
    headers+=(-H "Authorization: ${AUTH_HEADER}")
  fi

  local code
  code="$(curl -sS -o "$body_file" -w "%{http_code}" -X "$method" "${headers[@]}" "$url")"

  if [ "$code" != "$expected" ]; then
    echo "[smoke] FAIL ${method} ${url} expected=${expected} got=${code}"
    echo "[smoke] response:"
    cat "$body_file"
    echo
    exit 1
  fi

  echo "[smoke] OK   ${method} ${url} code=${code}"
}

require_json_key() {
  local body_file="$1"
  local key="$2"
  if ! grep -q "\"${key}\"" "$body_file"; then
    echo "[smoke] FAIL response missing key: ${key}"
    cat "$body_file"
    echo
    exit 1
  fi
}

HEALTH_BODY="${TMP_DIR}/health.json"
REVENUE_BODY="${TMP_DIR}/revenue-summary.json"
POSTMARK_BODY="${TMP_DIR}/postmark-ops-summary.json"

request "GET" "${API_BASE_URL}/health" "200" "$HEALTH_BODY"
require_json_key "$HEALTH_BODY" "ok"

request "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/revenue/summary" "200" "$REVENUE_BODY"
require_json_key "$REVENUE_BODY" "tenantId"
require_json_key "$REVENUE_BODY" "rollup"

request "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/integrations/postmark/operator-summary" "200" "$POSTMARK_BODY"
require_json_key "$POSTMARK_BODY" "rollups"
require_json_key "$POSTMARK_BODY" "invariants"

echo "[smoke] PASS railway smoke checks"
