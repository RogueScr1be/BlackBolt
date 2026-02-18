#!/usr/bin/env bash
set -euo pipefail

required_env=(API_BASE_URL TENANT_ID STRIPE_WEBHOOK_SECRET DATABASE_URL)
for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: missing required env: $name" >&2
    exit 1
  fi
done

now_ts="$(date +%s)"
now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rand_suffix="$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8)"
event_id="evt_sos_${now_ts}_${rand_suffix}"
payment_intent_id="pi_sos_${now_ts}_${rand_suffix}"

payload="$(cat <<JSON
{"id":"${event_id}","type":"payment_intent.succeeded","data":{"object":{"id":"${payment_intent_id}","metadata":{"sos_tenant_id":"${TENANT_ID}","sos_consult_type":"in_home","sos_parent_name":"Leah Whitley","sos_parent_email":"leah@example.com","sos_parent_phone":"832-111-2222","sos_parent_address":"Houston, TX","sos_baby_name":"Baby W","sos_baby_dob":"2026-01-01"}}}}
JSON
)"

signature_payload="${now_ts}.${payload}"
signature_hex="$(printf '%s' "${signature_payload}" | openssl dgst -sha256 -hmac "${STRIPE_WEBHOOK_SECRET}" -binary | xxd -p -c 256)"
stripe_signature="t=${now_ts},v1=${signature_hex}"

echo "Posting Stripe smoke webhook to ${API_BASE_URL}/v1/webhooks/stripe"
response="$(curl -sS -X POST "${API_BASE_URL}/v1/webhooks/stripe" \
  -H "content-type: application/json" \
  -H "stripe-signature: ${stripe_signature}" \
  --data "${payload}")"

echo "Webhook response: ${response}"

SMOKE_EVENT_ID="${event_id}" \
SMOKE_TENANT_ID="${TENANT_ID}" \
SMOKE_PAYMENT_INTENT_ID="${payment_intent_id}" \
node - <<'NODE'
const { PrismaClient } = require('@prisma/client');

const eventId = process.env.SMOKE_EVENT_ID;
const tenantId = process.env.SMOKE_TENANT_ID;
const paymentIntentId = process.env.SMOKE_PAYMENT_INTENT_ID;
const expectedJobKey = `sos-case:create:${tenantId}:${paymentIntentId}`;

const prisma = new PrismaClient();

async function main() {
  const timeoutMs = 45_000;
  const pollMs = 1_500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const webhookEvent = await prisma.sosStripeWebhookEvent.findUnique({
      where: { providerEventId: eventId }
    });

    if (!webhookEvent) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }

    const sosCase = await prisma.sosCase.findUnique({
      where: {
        tenantId_stripePaymentIntentId: {
          tenantId,
          stripePaymentIntentId: paymentIntentId
        }
      }
    });

    if (!sosCase) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }

    const payload = await prisma.sosCasePayload.findFirst({
      where: { caseId: sosCase.id },
      orderBy: { version: 'desc' }
    });

    const artifact = await prisma.sosArtifact.findUnique({
      where: {
        caseId_artifactType: {
          caseId: sosCase.id,
          artifactType: 'drive_folder'
        }
      }
    });

    const jobRun = await prisma.jobRun.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey: expectedJobKey
        }
      }
    });

    if (!payload || !artifact || !jobRun || jobRun.state !== 'succeeded') {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }

    console.log(JSON.stringify({
      ok: true,
      webhookEventId: webhookEvent.id,
      caseId: sosCase.id,
      payloadId: payload.id,
      artifactId: artifact.id,
      driveFolderId: artifact.driveFileId,
      jobRunId: jobRun.id,
      jobRunState: jobRun.state
    }, null, 2));
    return;
  }

  throw new Error('Timed out waiting for SOS orchestration records');
}

main()
  .catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE

echo "Stripe smoke completed at ${now_iso}"
