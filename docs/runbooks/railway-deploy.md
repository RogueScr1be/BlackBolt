# Railway Deploy Runbook (API + Worker)

## Topology
- `blackbolt-api` service: serves HTTP API only.
- `blackbolt-worker` service: runs queue processors only (no HTTP listener).
- Shared `postgres` service.
- Shared `redis` service.

## Create Railway Project + Services
1. Create a new Railway project.
2. Add services:
- `blackbolt-api`
- `blackbolt-worker`
- `postgres` (Railway Postgres plugin/service)
- `redis` (Railway Redis plugin/service)
3. Connect both app services to the same GitHub repo.

## Service Start Commands
- `blackbolt-api`: `npm run api:start:prod`
- `blackbolt-worker`: `npm run worker:start:prod`

## Build SHA Injection Convention
- Set `BUILD_SHA` for both services at deploy time to the exact git commit being released.
- Boot banners must print this value for both roles:
- API banner includes `role=api ... build_sha=<sha>`
- Worker banner includes `role=worker ... build_sha=<sha>`
- Treat missing or mismatched `BUILD_SHA` as a release process error.

## Same SHA Discipline (Non-Negotiable)
- API and Worker must run the same commit SHA at all times.
- Use the same branch and the same deploy trigger source for both services.
- If using manual deploys, deploy the exact same commit in both services before marking release complete.
- If one service deploy fails, treat rollout as failed; do not leave mixed SHAs live.
- Verify both services print the same `build_sha` value in startup logs.

## Deploy Steps (Copy/Paste)
1. Confirm target commit SHA.
2. Trigger deploy for both `blackbolt-api` and `blackbolt-worker` from that same SHA.
3. Verify both deployments show identical commit SHA in Railway.
4. Run health checks:
- API service logs show startup succeeded.
- Worker service logs show startup succeeded and queue processors initialized.
5. Confirm runtime connectivity:
- API can reach Postgres + Redis.
- Worker can reach Postgres + Redis.

## Post-Deploy Verification
- `blackbolt-api` responds on `/health`.
- Worker process stays up (no crash loop).
- No env validation failures for `DATABASE_URL` or `REDIS_URL`.
- Run smoke script:
- `bash scripts/smoke/railway-smoke.sh <apiBaseUrl> <tenantId> <basicAuthOrDash>`

## Worker Health Surrogate
- Worker has no HTTP endpoint by design.
- Surrogate check is API-backed operator data:
- `GET /v1/tenants/{tenantId}/integrations/postmark/operator-summary` returns `200` and valid JSON.
- Manual fallback (if surrogate looks stale): inspect `blackbolt-worker` logs for active queue processing and recent startup banner with expected `build_sha`.
