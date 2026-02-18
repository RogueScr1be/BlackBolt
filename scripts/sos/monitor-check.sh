#!/usr/bin/env bash
set -euo pipefail

required=(API_BASE_URL TENANT_ID DATABASE_URL)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: missing required env: $name" >&2
    exit 1
  fi
done

base="${API_BASE_URL%/}"
failures=0

notify_failure() {
  local message="$1"
  if [[ -n "${SOS_MONITOR_WEBHOOK_URL:-}" ]]; then
    curl -sS -X POST "${SOS_MONITOR_WEBHOOK_URL}" \
      -H 'content-type: application/json' \
      --data "{\"source\":\"sos-monitor\",\"message\":\"${message}\"}" >/dev/null || true
  fi
}

echo "[monitor] api health"
if ! curl -fsS "${base}/health" >/dev/null; then
  echo "FAIL: API health check failed"
  notify_failure "SOS API health check failed"
  failures=$((failures + 1))
fi

echo "[monitor] scheduler endpoint"
sweep_resp="$(curl -sS -X POST "${base}/v1/sos/scheduler/followups/run" \
  -H 'content-type: application/json' \
  --data "{\"tenantId\":\"${TENANT_ID}\",\"windowStartDays\":30,\"windowEndDays\":60}")"
if [[ "${sweep_resp}" == *"statusCode"*"500"* ]]; then
  echo "FAIL: scheduler endpoint returned error: ${sweep_resp}"
  notify_failure "SOS scheduler endpoint returned 500"
  failures=$((failures + 1))
fi

echo "[monitor] integration alerts backlog"
ALERT_COUNT=$(TENANT_ID="${TENANT_ID}" node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const tenantId = process.env.TENANT_ID;
(async () => {
  const since = new Date(Date.now() - (24 * 60 * 60 * 1000));
  const count = await prisma.integrationAlert.count({
    where: {
      tenantId,
      integration: 'sos',
      createdAt: { gte: since }
    }
  });
  process.stdout.write(String(count));
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err.message);
  await prisma.$disconnect();
  process.exit(1);
});
NODE
)

echo "alerts_last_24h=${ALERT_COUNT}"
if [[ "${ALERT_COUNT}" -gt 0 ]]; then
  notify_failure "SOS has ${ALERT_COUNT} integration alerts in last 24h"
fi

if [[ "${failures}" -gt 0 ]]; then
  exit 1
fi

echo "[monitor] OK"
