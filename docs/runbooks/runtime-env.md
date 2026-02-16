# Runtime Environment Runbook

## Required Environment Variables

These must be present for both `blackbolt-api` and `blackbolt-worker`:
- `DATABASE_URL`
- `REDIS_URL`

Startup fails fast if either is missing.

## Recommended Project-Wide Variables (Shared)
- `DATABASE_URL` (from Railway Postgres)
- `REDIS_URL` (from Railway Redis)
- `POSTMARK_SEND_DISABLED=1` (safe default for initial deploy)
- `NODE_ENV=production`
- `BUILD_SHA` (set to the exact deployed git commit for both API and Worker)

## Service-Specific Variables

### `blackbolt-api`
- `PORT` (Railway usually injects this)
- Postmark webhook auth/security envs used by webhook endpoint:
- `POSTMARK_WEBHOOK_BASIC_AUTH`
- `POSTMARK_WEBHOOK_BASIC_AUTH_PREVIOUS` (optional, during credential rotation)
- `POSTMARK_WEBHOOK_IP_ALLOWLIST` (optional, comma-separated)

### `blackbolt-worker`
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

## Local Operator Defaults
- Default operator API base URL: `https://blackbolt-api-production.up.railway.app`
- Operator tenant ID is persisted locally in app settings.
- Optional auth header can be stored as:
- full header value (`Basic ...` or `Bearer ...`)
- or raw `user:pass` (app encodes this into `Basic ...`).
- Launch helper:
- `bash scripts/start-operator.sh`
