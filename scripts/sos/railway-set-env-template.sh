#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SOS_PROJECT_PATH:-}" ]]; then
  echo "Set SOS_PROJECT_PATH to the standalone SOS workspace path before running." >&2
  exit 1
fi

cat <<'TEMPLATE'
# Fill all values, then execute in your SOS standalone project directory.

railway variable set --service sos-api \
  TENANT_ID='<tenant-id>' \
  STRIPE_SECRET_KEY='sk_live_...' \
  STRIPE_WEBHOOK_SECRET='whsec_...' \
  SOS_POSTMARK_SERVER_TOKEN='...' \
  SOS_POSTMARK_FROM_EMAIL='sender@example.com' \
  SOS_FAX_PROVIDER='srfax' \
  SOS_SRFAX_BASE_URL='https://www.srfax.com/SRF_SecWebSvc.php' \
  SOS_SRFAX_ACCOUNT_ID='...' \
  SOS_SRFAX_PASSWORD='...' \
  SOS_SRFAX_SENDER_NUMBER='...' \
  REDIS_URL='redis://...' \
  DATABASE_URL='postgresql://...'

railway variable set --service sos-worker \
  TENANT_ID='<tenant-id>' \
  GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  SOS_DRIVE_ROOT_FOLDER_ID='...' \
  SOS_POSTMARK_SERVER_TOKEN='...' \
  SOS_POSTMARK_FROM_EMAIL='sender@example.com' \
  SOS_FAX_PROVIDER='srfax' \
  SOS_SRFAX_BASE_URL='https://www.srfax.com/SRF_SecWebSvc.php' \
  SOS_SRFAX_ACCOUNT_ID='...' \
  SOS_SRFAX_PASSWORD='...' \
  SOS_SRFAX_SENDER_NUMBER='...' \
  SOS_FOLLOWUP_SWEEP_DISABLED='0' \
  SOS_FOLLOWUP_SWEEP_INTERVAL_MS='86400000' \
  REDIS_URL='redis://...' \
  DATABASE_URL='postgresql://...'
TEMPLATE
