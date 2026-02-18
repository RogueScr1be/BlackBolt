# SOS Standalone Deploy Runbook

## Goal
Deploy SOS as a dedicated runtime separate from BlackBolt shared production.

## Runtime Topology
- `sos-api` service (HTTP API + webhooks)
- `sos-worker` service (BullMQ processors + daily sweep scheduler)
- `sos-postgres` database
- `sos-redis` queue backend

## Deploy Steps
1. Create a new project/environment for SOS only.
2. Provision `Postgres` and `Redis` services.
3. Provision `sos-api` and `sos-worker` from this repo commit.
4. Set env files from:
- `sos-standalone/env/.env.api.example`
- `sos-standalone/env/.env.worker.example`
5. Apply migrations using SOS database URL:
```bash
DATABASE_URL=<sos_db_public_url> npm run prisma:migrate:deploy
```
6. Verify routes are live:
```bash
curl -sS -X POST "$API_BASE_URL/v1/sos/scheduler/followups/run" \
  -H 'content-type: application/json' \
  --data '{"tenantId":"<TENANT_ID>","windowStartDays":30,"windowEndDays":60}'
```

## Preflight + Smoke
1. `npm run sos:preflight`
2. `bash scripts/sos/stripe-smoke.sh`
3. Export produced `CASE_ID`
4. `npm run sos:smoke:phase6-7`

## Rollback
- Redeploy previous known-good image for `sos-api` and `sos-worker`.
- Keep DB state; do not delete migrations.
- Re-run preflight and scheduler endpoint verification.
