#!/usr/bin/env bash
set -euo pipefail

required_env=(API_BASE_URL TENANT_ID CASE_ID DATABASE_URL)
for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: missing required env: $name" >&2
    exit 1
  fi
done

base="${API_BASE_URL%/}"

echo "[smoke] send follow-up"
curl -sS -X POST "${base}/v1/sos/cases/${CASE_ID}/follow-up/send?tenantId=${TENANT_ID}" \
  -H "content-type: application/json"

echo
echo "[smoke] send provider fax"
curl -sS -X POST "${base}/v1/sos/cases/${CASE_ID}/provider-fax/send?tenantId=${TENANT_ID}" \
  -H "content-type: application/json"

echo
echo "[smoke] run follow-up sweep"
curl -sS -X POST "${base}/v1/sos/scheduler/followups/run" \
  -H "content-type: application/json" \
  --data "{\"tenantId\":\"${TENANT_ID}\",\"windowStartDays\":30,\"windowEndDays\":60}"

echo
echo "[smoke] verify DB artifacts"
SMOKE_TENANT_ID="${TENANT_ID}" SMOKE_CASE_ID="${CASE_ID}" node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const tenantId = process.env.SMOKE_TENANT_ID;
const caseId = process.env.SMOKE_CASE_ID;

async function main() {
  const [followUp, fax] = await Promise.all([
    prisma.sosArtifact.findUnique({
      where: { caseId_artifactType: { caseId, artifactType: 'follow_up_letter_pdf' } }
    }),
    prisma.sosArtifact.findUnique({
      where: { caseId_artifactType: { caseId, artifactType: 'provider_fax_packet_pdf' } }
    })
  ]);

  if (!followUp || !fax) {
    throw new Error('Expected follow-up and fax artifacts to exist');
  }

  const sweepQueued = await prisma.sosArtifact.count({
    where: { tenantId, artifactType: 'review_referral_email' }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        followUpArtifactId: followUp.id,
        faxArtifactId: fax.id,
        sweepQueuedCount: sweepQueued
      },
      null,
      2
    )
  );
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

echo "[smoke] phase 6/7 smoke complete"
