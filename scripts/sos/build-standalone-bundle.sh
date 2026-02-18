#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${ROOT_DIR}/dist/sos-standalone/SOS_Leah_${STAMP}"

mkdir -p "${OUT_DIR}"/{forms,runbooks,scripts,env,checklists,monitoring}

cp -R "${ROOT_DIR}/docs/soslactation/templates" "${OUT_DIR}/forms/templates"
cp "${ROOT_DIR}/docs/soslactation/canonical.schema.json" "${OUT_DIR}/forms/canonical.schema.json"
cp "${ROOT_DIR}/docs/soslactation/folder-structure.md" "${OUT_DIR}/forms/folder-structure.md"
cp "${ROOT_DIR}/docs/soslactation/template-extraction.md" "${OUT_DIR}/forms/template-extraction.md"

cp "${ROOT_DIR}/docs/runbooks/sos-standalone-deploy.md" "${OUT_DIR}/runbooks/sos-standalone-deploy.md"
cp "${ROOT_DIR}/docs/runbooks/sos-leah-quickstart.md" "${OUT_DIR}/runbooks/sos-leah-quickstart.md"
cp "${ROOT_DIR}/docs/runbooks/sos-monitoring.md" "${OUT_DIR}/runbooks/sos-monitoring.md"
cp "${ROOT_DIR}/docs/runbooks/sos-standalone-handoff.md" "${OUT_DIR}/runbooks/sos-standalone-handoff.md"
cp "${ROOT_DIR}/docs/runbooks/runtime-env.md" "${OUT_DIR}/runbooks/runtime-env.md"

cp "${ROOT_DIR}/scripts/sos/preflight-check.sh" "${OUT_DIR}/scripts/preflight-check.sh"
cp "${ROOT_DIR}/scripts/sos/stripe-smoke.sh" "${OUT_DIR}/scripts/stripe-smoke.sh"
cp "${ROOT_DIR}/scripts/sos/phase6-7-smoke.sh" "${OUT_DIR}/scripts/phase6-7-smoke.sh"
cp "${ROOT_DIR}/scripts/sos/monitor-check.sh" "${OUT_DIR}/scripts/monitor-check.sh"
cp "${ROOT_DIR}/scripts/sos/railway-set-env-template.sh" "${OUT_DIR}/scripts/railway-set-env-template.sh"
chmod +x "${OUT_DIR}"/scripts/*.sh

cp "${ROOT_DIR}/sos-standalone/env/.env.api.example" "${OUT_DIR}/env/.env.api.example"
cp "${ROOT_DIR}/sos-standalone/env/.env.worker.example" "${OUT_DIR}/env/.env.worker.example"
cp "${ROOT_DIR}/sos-standalone/checklists/first-run-checklist.md" "${OUT_DIR}/checklists/first-run-checklist.md"
cp "${ROOT_DIR}/sos-standalone/monitoring/alerts.md" "${OUT_DIR}/monitoring/alerts.md"
cp "${ROOT_DIR}/sos-standalone/README.md" "${OUT_DIR}/README.md"

(
  cd "${ROOT_DIR}/dist/sos-standalone"
  zip -qr "SOS_Leah_${STAMP}.zip" "SOS_Leah_${STAMP}"
)

echo "Created bundle directory: ${OUT_DIR}"
echo "Created zip: ${ROOT_DIR}/dist/sos-standalone/SOS_Leah_${STAMP}.zip"
