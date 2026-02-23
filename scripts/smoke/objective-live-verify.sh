#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 5 ]; then
  echo "Usage: bash scripts/smoke/objective-live-verify.sh <apiBaseUrl> <tenantId> <operatorKey> [authHeaderOrDash] [month]"
  echo "Example: bash scripts/smoke/objective-live-verify.sh https://blackbolt-api-production.up.railway.app cml... <operatorKey> - 2026-02"
  exit 64
fi

API_BASE_URL="${1%/}"
TENANT_ID="$2"
OPERATOR_KEY="$3"
AUTH_INPUT="${4:--}"
MONTH_INPUT="${5:-$(date -u +%Y-%m)}"

if ! [[ "$MONTH_INPUT" =~ ^[0-9]{4}-[0-9]{2}$ ]]; then
  echo "[live] FAIL month must be YYYY-MM, got: ${MONTH_INPUT}"
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
  headers=(-H "x-tenant-id: ${TENANT_ID}" -H "x-operator-key: ${OPERATOR_KEY}" -H "x-user-id: objective-live")
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
    echo "[live] FAIL ${name} expected one of [${expected[*]}] got=${got}"
    cat "${TMP_DIR}/${name}.body"
    echo
    exit 1
  fi
  echo "[live] OK   ${name} status=${got}"
}

SMOKE_CODE="$(call_endpoint "smoke" "POST" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/operator/smoke" "${TMP_DIR}/smoke.body" "{}")"
expect_status "smoke" "$SMOKE_CODE" "200" "201"

RUNS_CODE="$(call_endpoint "campaign_runs" "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/campaign-runs?limit=100" "${TMP_DIR}/campaign_runs.body")"
expect_status "campaign_runs" "$RUNS_CODE" "200"

REPORT_CODE="$(call_endpoint "monthly_report" "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/reports/monthly?month=${MONTH_INPUT}" "${TMP_DIR}/monthly_report.body")"
expect_status "monthly_report" "$REPORT_CODE" "200"

CSV_CODE="$(call_endpoint "monthly_csv" "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/reports/monthly/export.csv?month=${MONTH_INPUT}" "${TMP_DIR}/monthly_csv.body")"
expect_status "monthly_csv" "$CSV_CODE" "200"

PDF_CODE="$(call_endpoint "monthly_pdf" "GET" "${API_BASE_URL}/v1/tenants/${TENANT_ID}/reports/monthly/pdf?month=${MONTH_INPUT}" "${TMP_DIR}/monthly_pdf.body")"
expect_status "monthly_pdf" "$PDF_CODE" "200"

PDF_DESC="$(file "${TMP_DIR}/monthly_pdf.body" | sed "s#${TMP_DIR}/monthly_pdf.body: ##")"
if [[ "$PDF_DESC" != PDF* ]]; then
  echo "[live] FAIL monthly_pdf is not a PDF: ${PDF_DESC}"
  exit 1
fi
echo "[live] OK   monthly_pdf signature=${PDF_DESC}"

if ! head -n 1 "${TMP_DIR}/monthly_csv.body" | grep -q '^metric,value$'; then
  echo "[live] FAIL monthly_csv missing expected header metric,value"
  exit 1
fi
echo "[live] OK   monthly_csv header=metric,value"

node - "$TMP_DIR" "$MONTH_INPUT" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const month = process.argv[3];
const readJson = (name) => JSON.parse(fs.readFileSync(`${path}/${name}.body`, 'utf8'));

const runsBody = readJson('campaign_runs');
const report = readJson('monthly_report');
const smoke = readJson('smoke');

const runItems = Array.isArray(runsBody.items) ? runsBody.items : [];
const totals = report.totals ?? {};

const sentCountReport = Number(totals.sent_count ?? totals.sentCount ?? 0);
const clickCountReport = Number(totals.click_count ?? totals.clickCount ?? 0);
const runCountReport = Number(totals.run_count ?? totals.runCount ?? 0);
const runMsgSentReport = Number(totals.run_messages_sent ?? totals.runMessagesSent ?? 0);
const runMsgQueuedReport = Number(totals.run_messages_queued ?? totals.runMessagesQueued ?? 0);

const runMsgSentFromRuns = runItems.reduce((sum, run) => sum + Number(run.messages_sent ?? run.messagesSent ?? 0), 0);
const runMsgQueuedFromRuns = runItems.reduce((sum, run) => sum + Number(run.messages_queued ?? run.messagesQueued ?? 0), 0);

const smokePassed = smoke.overall_passed === true || smoke.overallPassed === true;
const hasSentEvidence = sentCountReport > 0 || runMsgSentReport > 0 || runMsgSentFromRuns > 0;
const hasQueuedToSentShape = (runMsgQueuedFromRuns > 0 || runMsgQueuedReport > 0) && hasSentEvidence;
const hasClickEvidence = clickCountReport > 0;
const hasRunEvidence = runItems.length > 0 || runCountReport > 0;

console.log(`[live] evidence month=${month}`);
console.log(`[live] runs_count_api=${runItems.length}`);
console.log(`[live] runs_report_count=${runCountReport}`);
console.log(`[live] sent_count_report=${sentCountReport}`);
console.log(`[live] click_count_report=${clickCountReport}`);
console.log(`[live] run_messages_queued_report=${runMsgQueuedReport}`);
console.log(`[live] run_messages_sent_report=${runMsgSentReport}`);
console.log(`[live] smoke_overall_passed=${smokePassed}`);

const failures = [];
if (!smokePassed) failures.push('smoke did not report overall pass');
if (!hasRunEvidence) failures.push('no run evidence in campaign-runs/report');
if (!hasSentEvidence) failures.push('no SENT evidence in monthly/report or run aggregates');
if (!hasQueuedToSentShape) failures.push('no queued-to-sent pipeline evidence');
if (!hasClickEvidence) failures.push('no click evidence in monthly report totals');

if (failures.length > 0) {
  console.log('[live] Gate C: FAIL');
  for (const f of failures) console.log(`[live] blocker: ${f}`);
  process.exit(2);
}

console.log('[live] Gate C: PASS');
NODE

if [ -n "${DATABASE_PUBLIC_URL:-}" ]; then
  echo "[live] optional db counters enabled (DATABASE_PUBLIC_URL present)"
  node - "$TENANT_ID" <<'NODE'
const { PrismaClient } = require('@prisma/client');
const tenantId = process.argv[2];
const dbUrl = process.env.DATABASE_PUBLIC_URL;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

(async () => {
  const [queued, sent, simulated, failed, clicks, attributed] = await Promise.all([
    prisma.campaignMessage.count({ where: { tenantId, status: 'QUEUED' } }),
    prisma.campaignMessage.count({ where: { tenantId, status: 'SENT' } }),
    prisma.campaignMessage.count({ where: { tenantId, status: 'SENT_SIMULATED' } }),
    prisma.campaignMessage.count({ where: { tenantId, status: 'FAILED' } }),
    prisma.clickEvent.count({ where: { tenantId } }),
    prisma.revenueAttribution.count({ where: { tenantId } })
  ]);
  console.log(`[live][db] queued=${queued} sent=${sent} sent_simulated=${simulated} failed=${failed} clicks=${clicks} attributions=${attributed}`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.log(`[live][db] WARN unable to query db counters: ${err.message}`);
  await prisma.$disconnect();
});
NODE
fi

echo "[live] COMPLETE Gate C verification finished"
