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
- `POSTMARK_SEND_DISABLED=1` (safe default for initial deploy)
- `NODE_ENV=production`
- `BUILD_SHA` (set to the exact deployed git commit for both API and Worker)

## Service-Specific Variables

### `blackbolt-api`
- `PORT` (Railway usually injects this)
- `STRIPE_SECRET_KEY` (required for SOS intake payment-intent creation endpoint)
- `STRIPE_WEBHOOK_SECRET` (required for `/v1/webhooks/stripe` signature verification)
- `REDIS_URL` is required when SOS Stripe webhook orchestration is enabled (queue-backed flow).
- `SOS_POSTMARK_SERVER_TOKEN` (required for SOS follow-up email sends)
- `SOS_POSTMARK_FROM_EMAIL` (required sender for SOS follow-up emails)
- `SOS_FAX_PROVIDER=srfax`
- `SOS_SRFAX_BASE_URL`
- `SOS_SRFAX_ACCOUNT_ID`
- `SOS_SRFAX_PASSWORD`
- `SOS_SRFAX_SENDER_NUMBER`
- Postmark webhook auth/security envs used by webhook endpoint:
- `POSTMARK_WEBHOOK_BASIC_AUTH`
- `POSTMARK_WEBHOOK_BASIC_AUTH_PREVIOUS` (optional, during credential rotation)
- `POSTMARK_WEBHOOK_IP_ALLOWLIST` (optional, comma-separated)

### `blackbolt-worker`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (raw service-account JSON string for Drive API auth)
- `SOS_DRIVE_ROOT_FOLDER_ID` (Drive parent folder id for SOS case folders)
- `SOS_FOLLOWUP_SWEEP_DISABLED` (`1` disables automatic daily sweep)
- `SOS_FOLLOWUP_SWEEP_INTERVAL_MS` (default `86400000`)
- Queue/sweeper tuning envs (optional):
- `POSTMARK_SEND_SWEEPER_DISABLED`
- `POSTMARK_SEND_SWEEPER_EVERY_MS`
- `POSTMARK_SEND_MAX_ATTEMPTS`

## Safe Initial Defaults
- Keep `POSTMARK_SEND_DISABLED=1` until shadow checks are complete.
- Do not unset this flag until explicit go-live approval.

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
