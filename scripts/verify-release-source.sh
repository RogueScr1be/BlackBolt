#!/usr/bin/env sh
set -eu

: "${BLACKBOLT_REF:?BLACKBOLT_REF is required}"

echo "[release-source] requested_ref=${BLACKBOLT_REF}"

resolved_commit="$(git rev-parse --verify --quiet "${BLACKBOLT_REF}^{commit}")"
if [ -z "${resolved_commit}" ]; then
  echo "[release-source] failed_to_resolve_ref=${BLACKBOLT_REF}" >&2
  exit 1
fi

git checkout "${BLACKBOLT_REF}"

checked_out_ref="$(git branch --show-current || true)"
checked_out_head="$(git rev-parse HEAD)"

echo "[release-source] checked_out_ref=${checked_out_ref:-HEAD}"
echo "[release-source] checked_out_head=${checked_out_head}"

if [ "${checked_out_head}" != "${resolved_commit}" ]; then
  echo "[release-source] checkout_mismatch expected=${resolved_commit} actual=${checked_out_head}" >&2
  exit 1
fi

test -f apps/api/src/modules/postmark/postmark-review-alert.service.ts
test -f apps/api/src/modules/postmark/postmark.controller.ts
test -f apps/api/src/modules/postmark/postmark.auth.ts
test -f apps/api/src/openapi-route-manifest.ts

grep -Fq 'postmark/inbound/google-review-alert' apps/api/src/modules/postmark/postmark.controller.ts
grep -Fq 'resolvePostmarkWebhookSourceIp' apps/api/src/modules/postmark/postmark.controller.ts
grep -Fq 'POSTMARK_WEBHOOK_TRUST_PROXY_HEADERS' apps/api/src/modules/postmark/postmark.controller.ts
grep -Fq 'receiveGoogleReviewAlert' apps/api/src/openapi-route-manifest.ts

echo "[release-source] route-bearing_assertions=passed"
