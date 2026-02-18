#!/usr/bin/env bash
set -euo pipefail

required_env=(
  API_BASE_URL
  TENANT_ID
  DATABASE_URL
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  GOOGLE_SERVICE_ACCOUNT_JSON
  SOS_DRIVE_ROOT_FOLDER_ID
  SOS_POSTMARK_SERVER_TOKEN
  SOS_POSTMARK_FROM_EMAIL
  SOS_FAX_PROVIDER
  SOS_SRFAX_BASE_URL
  SOS_SRFAX_ACCOUNT_ID
  SOS_SRFAX_PASSWORD
  SOS_SRFAX_SENDER_NUMBER
)

for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: missing required env: $name" >&2
    exit 1
  fi
done

if [[ "${SOS_FAX_PROVIDER}" != "srfax" ]]; then
  echo "ERROR: SOS_FAX_PROVIDER must be 'srfax' for this phase" >&2
  exit 1
fi

echo "[preflight] API health check"
curl -fsS "${API_BASE_URL%/}/health" >/dev/null

echo "[preflight] DB connectivity check"
node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.$queryRaw`SELECT 1`;
}
main().finally(async () => {
  await prisma.$disconnect();
});
NODE

echo "[preflight] Drive credentials parse check"
node - <<'NODE'
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const parsed = JSON.parse(raw);
if (!parsed.client_email || !parsed.private_key) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key');
}
NODE

echo "[preflight] Stripe signature path readiness (ignored event)"
ts="$(date +%s)"
payload='{"id":"evt_preflight","type":"charge.refunded","data":{"object":{"id":"pi_preflight","metadata":{}}}}'
signed_payload="${ts}.${payload}"
sig_hex="$(printf '%s' "${signed_payload}" | openssl dgst -sha256 -hmac "${STRIPE_WEBHOOK_SECRET}" -binary | xxd -p -c 256)"
sig_header="t=${ts},v1=${sig_hex}"
response="$(curl -sS -X POST "${API_BASE_URL%/}/v1/webhooks/stripe" \
  -H "content-type: application/json" \
  -H "stripe-signature: ${sig_header}" \
  --data "${payload}")"
if [[ "${response}" != *"event_type_ignored"* ]]; then
  echo "ERROR: unexpected webhook preflight response: ${response}" >&2
  exit 1
fi

echo "[preflight] SRFax auth reachability check"
status_code="$(curl -sS -o /dev/null -w "%{http_code}" \
  -u "${SOS_SRFAX_ACCOUNT_ID}:${SOS_SRFAX_PASSWORD}" \
  "${SOS_SRFAX_BASE_URL%/}/")"
if [[ "${status_code}" == "000" || "${status_code}" == "401" || "${status_code}" == "403" || "${status_code}" =~ ^5 ]]; then
  echo "ERROR: SRFax endpoint/auth check failed with status ${status_code}" >&2
  exit 1
fi

echo "[preflight] OK"
