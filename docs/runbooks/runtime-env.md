# Runtime Environment Runbook

## Required Environment Variables

### `blackbolt-api`
- `DATABASE_URL`
- `REDIS_URL`

### `blackbolt-worker`
- `DATABASE_URL`
- `REDIS_URL`

Startup fails fast for required variables per role.

## Recommended Project-Wide Variables (Shared)
- `DATABASE_URL` (from Railway Postgres)
- `REDIS_URL` (from Railway Redis)
- `NODE_ENV=production`
- `BUILD_SHA` (set to the exact deployed git commit for both API and Worker)

## Service-Specific Variables

### `blackbolt-api`
- `PORT` (Railway usually injects this)
- `STRIPE_SECRET_KEY` (required for SOS intake payment-intent creation endpoint)
- `STRIPE_WEBHOOK_SECRET` (required for `/v1/webhooks/stripe` signature verification)
- `REDIS_URL` is required when SOS Stripe webhook orchestration is enabled (queue-backed flow).
- `SOS_GOOGLE_SERVICE_ACCOUNT_JSON` (service-account JSON for Gmail delegated send)
- `SOS_GMAIL_DELEGATED_USER` (must be `leah@soslactation.com`)
- `SOS_GMAIL_FROM_EMAIL` (must be `leah@soslactation.com`)
- Fax provider mode:
  - Baseline: `SOS_FAX_PROVIDER=srfax`
    - `SOS_SRFAX_BASE_URL`
    - `SOS_SRFAX_ACCOUNT_ID`
    - `SOS_SRFAX_PASSWORD`
    - `SOS_SRFAX_SENDER_NUMBER`
  - ICTFax pilot: `SOS_FAX_PROVIDER=ictfax`
    - `SOS_ICTFAX_BASE_URL` (host root or `/api` base)
    - `SOS_ICTFAX_API_USER`
    - `SOS_ICTFAX_API_PASSWORD`
    - Optional: `SOS_ICTFAX_ACCOUNT_ID` (numeric), `SOS_ICTFAX_CONTACT_NAME_PREFIX`

### `blackbolt-worker`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (raw service-account JSON string for Drive API auth)
- `SOS_DRIVE_ROOT_FOLDER_ID` (Drive parent folder ID only, not a full Google Drive URL)
- `SOS_FOLLOWUP_SWEEP_DISABLED` (`1` disables automatic daily sweep)
- `SOS_FOLLOWUP_SWEEP_INTERVAL_MS` (default `86400000`)
- `SOS_GOOGLE_SERVICE_ACCOUNT_JSON` (service-account JSON for Gmail delegated send, if worker-triggered sends are enabled)
- `SOS_GMAIL_DELEGATED_USER` (must be `leah@soslactation.com`)
- `SOS_GMAIL_FROM_EMAIL` (must be `leah@soslactation.com`)
- Keep fax provider env aligned with API service:
  - SRFax baseline: `SOS_FAX_PROVIDER=srfax` + `SOS_SRFAX_*`
  - ICTFax pilot: `SOS_FAX_PROVIDER=ictfax` + `SOS_ICTFAX_*`

## Safe Initial Defaults
- Keep `SOS_FOLLOWUP_SWEEP_DISABLED=1` until go-live approval for automated sweeps.

## Env Validation Checklist
1. In Railway, verify both services inherit project-wide `DATABASE_URL` and `REDIS_URL`.
2. Verify no empty-string values.
3. Verify neither service has stale Redis override values (for example `127.0.0.1:6379`).
4. Prefer Railway internal Redis URL for worker when both services are in the same Railway project.
5. Set identical `BUILD_SHA` on both services.
6. Deploy both services on the same commit SHA.
7. Confirm startup banners show expected role and the same `build_sha` value for API + Worker.
8. Confirm logs show successful startup without missing-env errors.
9. Run `scripts/sos/preflight-check.sh` with exported SOS envs before enabling Phase 6/7 live actions.
10. If running ICTFax pilot, keep production env on SRFax and switch only pilot runtime to `SOS_FAX_PROVIDER=ictfax`.

## Local Operator Defaults
- Default operator API base URL: `https://blackbolt-api-production.up.railway.app`
- Operator tenant ID is persisted locally in app settings.
- Operator auth is tenant-scoped (`x-tenant-id` + `x-operator-key`) backed by `operator_credentials`.
- Do not configure or depend on a global `OPERATOR_KEY` env var.
- Bootstrap/rotate operator keys via API/seed flow:
  - `npm run tenant:seed -- --name="Your Tenant" --slug=your-tenant`
  - `POST /v1/tenants/{tenantId}/operator/keys/rotate`
- Optional auth header can be stored as:
- full header value (`Basic ...` or `Bearer ...`)
- or raw `user:pass` (app encodes this into `Basic ...`).
- Launch helper:
- `bash scripts/start-operator.sh`

## Canonical Rollout Scripts
- Mandatory preflight (repo/scripts/Railway context):
- `bash scripts/smoke/objective-rollout-preflight.sh [mode]`
- npm alias:
- `npm run objective:rollout:preflight`
- Shadow preflight + Gate B:
- `bash scripts/smoke/objective-rollout-shadow.sh <apiBaseUrl> <tenantId> <operatorKey> <expectedBuildSha> [authOrDash] [YYYY-MM]`
- Live preflight + Gate C:
- `bash scripts/smoke/objective-rollout-live.sh <apiBaseUrl> <tenantId> <operatorKey> <expectedBuildSha> [authOrDash] [YYYY-MM]`
- Stabilization monitor:
- `bash scripts/smoke/objective-rollout-stabilize.sh <apiBaseUrl> <tenantId> <operatorKey> <durationMinutes> <intervalMinutes> [authOrDash] [YYYY-MM]`

## Context Failure Signatures
- `npm error Missing script: "objective:rollout:shadow"`:
- Root cause: wrong repo/worktree.
- Fix:
  1. `cd "/Users/thewhitley/.codex/worktrees/749b/New project"`
  2. `npm run objective:rollout:preflight`
- `Service 'blackbolt-api' not found` or `Service 'blackbolt-worker' not found`:
- Root cause: Railway CLI linked to wrong project/environment.
- Fix:
  1. `railway link` (project `BlackBolt`, environment `production`)
  2. `railway status`
  3. `npm run objective:rollout:preflight`
