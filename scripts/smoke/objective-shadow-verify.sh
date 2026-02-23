#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 5 ]; then
  echo "Usage: bash scripts/smoke/objective-shadow-verify.sh <apiBaseUrl> <tenantId> <operatorKey> [authHeaderOrDash] [month]"
  echo "Example: bash scripts/smoke/objective-shadow-verify.sh https://blackbolt-api-production.up.railway.app cml... <operatorKey> - 2026-02"
  exit 64
fi

API_BASE_URL="${1%/}"
TENANT_ID="$2"
OPERATOR_KEY="$3"
AUTH_INPUT="${4:--}"
MONTH_INPUT="${5:-$(date -u +%Y-%m)}"

if ! [[ "$MONTH_INPUT" =~ ^[0-9]{4}-[0-9]{2}$ ]]; then
  echo "[shadow] FAIL month must be YYYY-MM, got: ${MONTH_INPUT}"
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
  if [[ "$input" == *" "* ]]; then
    printf "%s" "$input"
    return 0
  fi
  local b64
  b64="$(printf "%s" "$input" | base64 | tr -d '\n')"
  printf "Basic %s" "$b64"
}

AUTH_HEADER="$(auth_header "$AUTH_INPUT")"

call_endpoint() {
  local name="$1"
  local method="$2"
  local url="$3"
  local outfile="$4"
  local body="${5:-}"

  local -a headers
  headers=(-H "x-tenant-id: ${TENANT_ID}" -H "x-operator-key: ${OPERATOR_KEY}" -H "x-user-id: objective-shadow")
  if [ -n "$AUTH_HEADER" ]; then
    headers+=(-H "Authorization: ${AUTH_HEADER}")
  fi
  if [ -n "$body" ]; then
    headers+=(-H "content-type: application/json")
  fi

  local code
  if [ -n "$body" ]; then
    code="$(curl -sS -o "$outfile" -w "%{http_code}" -X "$method" "${headers[@]}" --data "$body" "$url")"
  else
    code="$(curl -sS -o "$outfile" -w "%{http_code}" -X "$method" "${headers[@]}" "$url")"
  fi
  echo "$code"
}

expect_status() {
  local name="$1"
  local got="$2"
  shift 2
  local expected=("$@")
  local ok="0"
  for code in "${expected[@]}"; do
    if [ "$got" = "$code" ]; then
      ok="1"
      break
    fi
  done
  if [ "$ok" != "1" ]; then
    echo "[shadow] FAIL ${name} expected one of [${expected[*]}] got=${got}"
    cat "${TMP_DIR}/${name}.body"
    echo
    exit 1
  fi
  echo "[shadow] OK   ${name} status=${got}"
}

SMOKE_CODE="$(call_endpoint "smoke" "POST" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/operator/smoke" "${TMP_DIR}/smoke.body" "{}")"
expect_status "smoke" "$SMOKE_CODE" "200" "201"

DASH_CODE="$(call_endpoint "dashboard" "GET" "${API_BASE_URL}/dashboard/summary" "${TMP_DIR}/dashboard.body")"
expect_status "dashboard" "$DASH_CODE" "200"

ALERTS_CODE="$(call_endpoint "alerts" "GET" "${API_BASE_URL}/alerts?state=open" "${TMP_DIR}/alerts.body")"
expect_status "alerts" "$ALERTS_CODE" "200"

EVENTS_CODE="$(call_endpoint "events" "GET" "${API_BASE_URL}/events" "${TMP_DIR}/events.body")"
expect_status "events" "$EVENTS_CODE" "200"

TENANTS_CODE="$(call_endpoint "tenants" "GET" "${API_BASE_URL}/tenants" "${TMP_DIR}/tenants.body")"
expect_status "tenants" "$TENANTS_CODE" "200"

TENANT_DETAIL_CODE="$(call_endpoint "tenant_detail" "GET" "${API_BASE_URL}/tenants/${TENANT_ID}" "${TMP_DIR}/tenant_detail.body")"
expect_status "tenant_detail" "$TENANT_DETAIL_CODE" "200"

TENANT_METRICS_CODE="$(call_endpoint "tenant_metrics" "GET" "${API_BASE_URL}/tenants/${TENANT_ID}/metrics?range=30d" "${TMP_DIR}/tenant_metrics.body")"
expect_status "tenant_metrics" "$TENANT_METRICS_CODE" "200"

RUNS_CODE="$(call_endpoint "campaign_runs" "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/campaign-runs?limit=50" "${TMP_DIR}/campaign_runs.body")"
expect_status "campaign_runs" "$RUNS_CODE" "200"

REPORT_CODE="$(call_endpoint "monthly_report" "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/reports/monthly?month=${MONTH_INPUT}" "${TMP_DIR}/monthly_report.body")"
expect_status "monthly_report" "$REPORT_CODE" "200"

CSV_CODE="$(call_endpoint "monthly_csv" "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/reports/monthly/export.csv?month=${MONTH_INPUT}" "${TMP_DIR}/monthly_csv.body")"
expect_status "monthly_csv" "$CSV_CODE" "200"

PDF_CODE="$(call_endpoint "monthly_pdf" "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/reports/monthly/pdf?month=${MONTH_INPUT}" "${TMP_DIR}/monthly_pdf.body")"
expect_status "monthly_pdf" "$PDF_CODE" "200"

PDF_DESC="$(file "${TMP_DIR}/monthly_pdf.body" | sed "s#${TMP_DIR}/monthly_pdf.body: ##")"
if [[ "$PDF_DESC" != PDF* ]]; then
  echo "[shadow] FAIL monthly_pdf is not a PDF: ${PDF_DESC}"
  exit 1
fi
echo "[shadow] OK   monthly_pdf signature=${PDF_DESC}"

if ! head -n 1 "${TMP_DIR}/monthly_csv.body" | grep -q '^metric,value$'; then
  echo "[shadow] FAIL monthly_csv missing expected header metric,value"
  exit 1
fi
echo "[shadow] OK   monthly_csv header=metric,value"

node - "$TMP_DIR" "$MONTH_INPUT" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const month = process.argv[3];
const readJson = (name) => JSON.parse(fs.readFileSync(`${path}/${name}.body`, 'utf8'));

const runsBody = readJson('campaign_runs');
const report = readJson('monthly_report');
const smoke = readJson('smoke');

const runItems = Array.isArray(runsBody.items) ? runsBody.items : [];
const runsCount = runItems.length;
const runMessageQueuedFromRuns = runItems.reduce((sum, run) => sum + Number(run.messages_queued ?? run.messagesQueued ?? 0), 0);
const runMessageSentFromRuns = runItems.reduce((sum, run) => sum + Number(run.messages_sent ?? run.messagesSent ?? 0), 0);
const totals = report.totals ?? {};
const runCountFromReport = Number(totals.run_count ?? totals.runCount ?? 0);
const runQueuedFromReport = Number(totals.run_messages_queued ?? totals.runMessagesQueued ?? 0);
const runSentFromReport = Number(totals.run_messages_sent ?? totals.runMessagesSent ?? 0);

const hasRun = runsCount >= 1 || runCountFromReport >= 1;
const hasMessagePipelineEvidence =
  runMessageQueuedFromRuns > 0 ||
  runMessageSentFromRuns > 0 ||
  runQueuedFromReport > 0 ||
  runSentFromReport > 0;
const hasReportRunMetrics = runCountFromReport > 0 || runQueuedFromReport > 0 || runSentFromReport > 0;
const smokePassed = smoke.overall_passed === true || smoke.overallPassed === true;

console.log(`[shadow] evidence month=${month}`);
console.log(`[shadow] runs_count_api=${runsCount}`);
console.log(`[shadow] runs_report_count=${runCountFromReport}`);
console.log(`[shadow] run_messages_queued_report=${runQueuedFromReport}`);
console.log(`[shadow] run_messages_sent_report=${runSentFromReport}`);
console.log(`[shadow] smoke_overall_passed=${smokePassed}`);

const failures = [];
if (!smokePassed) failures.push('smoke did not report overall pass');
if (!hasRun) failures.push('no campaign run evidence (api list and report totals are zero)');
if (!hasMessagePipelineEvidence) failures.push('no queued/sent-simulated pipeline evidence in run or report metrics');
if (!hasReportRunMetrics) failures.push('monthly report run metrics still zero');

if (failures.length > 0) {
  console.log('[shadow] Gate B: FAIL');
  for (const f of failures) console.log(`[shadow] blocker: ${f}`);
  process.exit(2);
}

console.log('[shadow] Gate B: PASS');
NODE

if [ -n "${DATABASE_PUBLIC_URL:-}" ]; then
  echo "[shadow] optional db counters enabled (DATABASE_PUBLIC_URL present)"
  node - "$TENANT_ID" <<'NODE'
const { PrismaClient } = require('@prisma/client');
const tenantId = process.argv[2];
const dbUrl = process.env.DATABASE_PUBLIC_URL;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

(async () => {
  const [runs, queued, sent, simulated, failed] = await Promise.all([
    prisma.campaignRun.count({ where: { tenantId } }),
    prisma.campaignMessage.count({ where: { tenantId, status: 'QUEUED' } }),
    prisma.campaignMessage.count({ where: { tenantId, status: 'SENT' } }),
    prisma.campaignMessage.count({ where: { tenantId, status: 'SENT_SIMULATED' } }),
    prisma.campaignMessage.count({ where: { tenantId, status: 'FAILED' } })
  ]);
  console.log(`[shadow][db] campaign_runs=${runs} queued=${queued} sent=${sent} sent_simulated=${simulated} failed=${failed}`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.log(`[shadow][db] WARN unable to query db counters: ${err.message}`);
  await prisma.$disconnect();
});
NODE
fi

echo "[shadow] COMPLETE Gate B verification finished"
