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
  SOS_GOOGLE_SERVICE_ACCOUNT_JSON
  SOS_GMAIL_DELEGATED_USER
  SOS_GMAIL_FROM_EMAIL
  SOS_FAX_PROVIDER
)

for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: missing required env: $name" >&2
    exit 1
  fi
done

fax_provider="$(printf '%s' "${SOS_FAX_PROVIDER}" | tr '[:upper:]' '[:lower:]')"
if [[ "${fax_provider}" != "srfax" && "${fax_provider}" != "ictfax" ]]; then
  echo "ERROR: SOS_FAX_PROVIDER must be either 'srfax' or 'ictfax'" >&2
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

echo "[preflight] Gmail delegated sender credentials parse check"
node - <<'NODE'
const raw = process.env.SOS_GOOGLE_SERVICE_ACCOUNT_JSON;
const parsed = JSON.parse(raw);
if (!parsed.client_email || !parsed.private_key) {
  throw new Error('SOS_GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key');
}
if (!process.env.SOS_GMAIL_DELEGATED_USER || !process.env.SOS_GMAIL_FROM_EMAIL) {
  throw new Error('SOS_GMAIL_DELEGATED_USER and SOS_GMAIL_FROM_EMAIL are required');
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

if [[ "${fax_provider}" == "srfax" ]]; then
  fax_required=(SOS_SRFAX_BASE_URL SOS_SRFAX_ACCOUNT_ID SOS_SRFAX_PASSWORD SOS_SRFAX_SENDER_NUMBER)
  for name in "${fax_required[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      echo "ERROR: missing required env: $name" >&2
      exit 1
    fi
  done

  echo "[preflight] SRFax auth reachability check"
  status_code="$(curl -sS -o /dev/null -w "%{http_code}" \
    -u "${SOS_SRFAX_ACCOUNT_ID}:${SOS_SRFAX_PASSWORD}" \
    "${SOS_SRFAX_BASE_URL%/}/")"
  if [[ "${status_code}" == "000" || "${status_code}" == "401" || "${status_code}" == "403" || "${status_code}" =~ ^5 ]]; then
    echo "ERROR: SRFax endpoint/auth check failed with status ${status_code}" >&2
    exit 1
  fi
fi

if [[ "${fax_provider}" == "ictfax" ]]; then
  fax_required=(SOS_ICTFAX_BASE_URL SOS_ICTFAX_API_USER SOS_ICTFAX_API_PASSWORD)
  for name in "${fax_required[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      echo "ERROR: missing required env: $name" >&2
      exit 1
    fi
  done

  ictfax_base="${SOS_ICTFAX_BASE_URL%/}"
  if [[ "${ictfax_base}" != */api ]]; then
    ictfax_base="${ictfax_base}/api"
  fi

  echo "[preflight] ICTFax auth reachability check"
  auth_response="$(curl -sS -w $'\n%{http_code}' -X POST "${ictfax_base}/authenticate" \
    -H "content-type: application/json" \
    --data "{\"username\":\"${SOS_ICTFAX_API_USER}\",\"password\":\"${SOS_ICTFAX_API_PASSWORD}\",\"passowrd\":\"${SOS_ICTFAX_API_PASSWORD}\"}")"
  auth_status="$(printf '%s\n' "${auth_response}" | tail -n 1)"
  auth_body="$(printf '%s\n' "${auth_response}" | sed '$d')"
  if [[ "${auth_status}" != "200" ]]; then
    echo "ERROR: ICTFax auth check failed with status ${auth_status}" >&2
    exit 1
  fi

  AUTH_BODY="${auth_body}" node - <<'NODE'
const raw = process.env.AUTH_BODY ?? '';
let payload;
try {
  payload = JSON.parse(raw);
} catch (error) {
  throw new Error('ICTFax auth response was not valid JSON');
}
const token = payload.token || payload.access_token || payload.value;
if (!token) {
  throw new Error('ICTFax auth response did not include token');
}
NODE
fi

echo "[preflight] OK"
