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
3. Set identical `BUILD_SHA` on both services.
4. Deploy both services on the same commit SHA.
5. Confirm startup banners show expected role and the same `build_sha` value for API + Worker.
6. Confirm logs show successful startup without missing-env errors.
