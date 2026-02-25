#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SOS_PROJECT_PATH:-}" ]]; then
  echo "Set SOS_PROJECT_PATH to the standalone SOS workspace path before running." >&2
  exit 1
fi

cat <<'TEMPLATE'
# Fill all values, then execute in your SOS standalone project directory.
# Baseline release should stay on SRFax.

# --- SRFax baseline ---
railway variable set --service sos-api \
  TENANT_ID='<tenant-id>' \
  STRIPE_SECRET_KEY='sk_live_...' \
  STRIPE_WEBHOOK_SECRET='whsec_...' \
  SOS_GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  SOS_GMAIL_DELEGATED_USER='leah@soslactation.com' \
  SOS_GMAIL_FROM_EMAIL='leah@soslactation.com' \
  SOS_FAX_PROVIDER='srfax' \
  SOS_SRFAX_BASE_URL='https://www.srfax.com/SRF_SecWebSvc.php' \
  SOS_SRFAX_ACCOUNT_ID='...' \
  SOS_SRFAX_PASSWORD='...' \
  SOS_SRFAX_SENDER_NUMBER='...' \
  REDIS_URL='redis://...' \
  DATABASE_URL='postgresql://...'

# --- SRFax baseline ---
railway variable set --service sos-worker \
  TENANT_ID='<tenant-id>' \
  GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  SOS_DRIVE_ROOT_FOLDER_ID='...' \
  SOS_GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  SOS_GMAIL_DELEGATED_USER='leah@soslactation.com' \
  SOS_GMAIL_FROM_EMAIL='leah@soslactation.com' \
  SOS_FAX_PROVIDER='srfax' \
  SOS_SRFAX_BASE_URL='https://www.srfax.com/SRF_SecWebSvc.php' \
  SOS_SRFAX_ACCOUNT_ID='...' \
  SOS_SRFAX_PASSWORD='...' \
  SOS_SRFAX_SENDER_NUMBER='...' \
  SOS_FOLLOWUP_SWEEP_DISABLED='0' \
  SOS_FOLLOWUP_SWEEP_INTERVAL_MS='86400000' \
  REDIS_URL='redis://...' \
  DATABASE_URL='postgresql://...'

# --- ICTFax pilot (optional, keep this in pilot env only) ---
railway variable set --service sos-api \
  SOS_FAX_PROVIDER='ictfax' \
  SOS_ICTFAX_BASE_URL='https://ictfax.example.com' \
  SOS_ICTFAX_API_USER='api-user' \
  SOS_ICTFAX_API_PASSWORD='api-password' \
  SOS_ICTFAX_ACCOUNT_ID='12' \
  SOS_ICTFAX_CONTACT_NAME_PREFIX='SOS'

# --- ICTFax pilot (optional, keep this in pilot env only) ---
railway variable set --service sos-worker \
  SOS_FAX_PROVIDER='ictfax' \
  SOS_ICTFAX_BASE_URL='https://ictfax.example.com' \
  SOS_ICTFAX_API_USER='api-user' \
  SOS_ICTFAX_API_PASSWORD='api-password' \
  SOS_ICTFAX_ACCOUNT_ID='12' \
  SOS_ICTFAX_CONTACT_NAME_PREFIX='SOS'
TEMPLATE
