#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EXPECTED_PROJECT="${BLACKBOLT_EXPECTED_PROJECT:-BlackBolt}"
EXPECTED_ENVIRONMENT="${BLACKBOLT_EXPECTED_ENVIRONMENT:-production}"

cd "$REPO_ROOT"

fail() {
  echo "[release] FAIL $1" >&2
  exit 1
}

if ! command -v railway >/dev/null 2>&1; then
  fail "railway CLI not installed or not on PATH"
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "working tree must be clean before production deploy"
fi

STATUS_JSON="$(railway status --json)"
if [ -z "$STATUS_JSON" ]; then
  fail "railway status unavailable"
fi

STATUS_SUMMARY="$(printf '%s' "$STATUS_JSON" | node -e '
  let input = "";
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    try {
      const parsed = JSON.parse(input);
      const env = parsed.environments?.edges?.[0]?.node?.name ?? "";
      process.stdout.write(`${parsed.name ?? ""}\n${env}`);
    } catch {
      process.exit(1);
    }
  });
')"
PROJECT_NAME="$(printf '%s' "$STATUS_SUMMARY" | sed -n '1p')"
ENVIRONMENT_NAME="$(printf '%s' "$STATUS_SUMMARY" | sed -n '2p')"

if [ "$PROJECT_NAME" != "$EXPECTED_PROJECT" ]; then
  fail "linked Railway project is ${PROJECT_NAME}, expected ${EXPECTED_PROJECT}"
fi

if [ "$ENVIRONMENT_NAME" != "$EXPECTED_ENVIRONMENT" ]; then
  fail "linked Railway environment is ${ENVIRONMENT_NAME}, expected ${EXPECTED_ENVIRONMENT}"
fi

BUILD_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"

echo "[release] using BUILD_SHA=${BUILD_SHA}"
railway variable set --service blackbolt-api "BUILD_SHA=${BUILD_SHA}" --skip-deploys
railway variable set --service blackbolt-worker "BUILD_SHA=${BUILD_SHA}" --skip-deploys

echo "[release] deploying blackbolt-api from canonical repo root"
railway up . --service blackbolt-api --path-as-root --detach --message "canonical api release ${SHORT_SHA}"

echo "[release] deploying blackbolt-worker from canonical repo root"
railway up . --service blackbolt-worker --path-as-root --detach --message "canonical worker release ${SHORT_SHA}"

echo "[release] submitted canonical production deploys for SHA ${BUILD_SHA}"
echo "[release] next checks:"
echo "  railway deployment list --service blackbolt-api --limit 1 --json"
echo "  railway deployment list --service blackbolt-worker --limit 1 --json"
echo "  curl -sS https://blackbolt-api-production.up.railway.app/health"
