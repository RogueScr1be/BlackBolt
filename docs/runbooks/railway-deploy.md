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
1. Confirm target commit SHA and set in both services:
- `railway variable set --service blackbolt-api BUILD_SHA=<sha>`
- `railway variable set --service blackbolt-worker BUILD_SHA=<sha>`
2. Trigger deploy for both `blackbolt-api` and `blackbolt-worker` from that same SHA.
3. Verify both deployments show identical commit SHA in Railway and in boot banner logs.
4. Run health checks:
- API service logs show startup succeeded.
- Worker service logs show startup succeeded and queue processors initialized.
5. Confirm runtime connectivity:
- API can reach Postgres + Redis.
- Worker can reach Postgres + Redis.

## When `railway redeploy` Fails
If Railway reports that the latest deployment cannot be redeployed (building/deploying/removed):
1. Use the Railway UI service deploy gate for each service (`blackbolt-api`, `blackbolt-worker`).
2. Trigger a fresh deploy from the same commit SHA for each service.
3. Never mix SHAs between API and Worker while recovering.
4. Confirm each service shows at least one running replica before moving to smoke checks.

## No-Logs Triage Checklist (Worker)
1. Verify you are looking at the `blackbolt-worker` service log stream (not API/Postgres/Redis).
2. Verify replica count is greater than zero.
3. Verify there is an active deployment attached to the worker service.
4. Verify first startup line appears in logs (boot banner).
5. If no startup line appears, retrigger deploy from the same SHA in UI and re-check.

## First-Fatal-Line Triage
1. If no boot banner appears, check service start command and build command.
2. If banner appears and process exits, capture the first fatal line after banner and fix that exact dependency first.
3. Treat repeated Redis localhost errors (`127.0.0.1:6379`) as miswired `REDIS_URL` in service variables.

## Rollback
1. Identify last known good SHA from both service logs.
2. Set `BUILD_SHA` on API + Worker to that SHA.
3. Deploy both services from that same SHA.
4. Verify both boot banners show identical rollback SHA before reopening traffic-dependent operations.

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
