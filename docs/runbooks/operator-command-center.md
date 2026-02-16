# Operator Command Center Runbook

## Daily Loop
1. Open `BlackBolt Operator.app`.
2. Review `Command` tab:
   - Revenue snapshot
   - Health snapshot
   - Alert queue (`What needs me now`)
3. If alerts exist, move to `Interventions`.
4. Apply only scoped actions:
   - Retry GBP ingestion
   - Resume Postmark sends (with checklist acknowledgement)
   - Acknowledge reviewed alerts (local operator state)
5. Use `Evidence` for drill-down diagnostics (`Revenue`, `Reviews`, `Customers`, `Imports`).
6. Close app. Runtime remains active on Railway.

## Release Gate (Single Operator)
- API `/health` returns 200.
- Smoke passes:
  - `bash scripts/smoke/railway-smoke.sh <apiBaseUrl> <tenantId> <basicAuthOrDash>`
- API and Worker boot banners print identical `build_sha`.
- Worker has no `127.0.0.1:6379` Redis errors.

## Weekly KPIs
- Attributed revenue trend (`last24h`, `last1h`).
- Unresolved alert volume and age.
- GBP ingestion freshness (`lastSuccessAt` recency).
- Postmark paused state duration.

## Safety Defaults
- Keep `POSTMARK_SEND_DISABLED=1` until explicit send go-live.
- Treat invariant breaches as release-blocking operational incidents.
