# Operator Command Center Runbook

## Daily Operator SOP (<10 minutes)
1. Launch Operator from source using the canonical latest-build guard:
   - `bash scripts/operator/open-latest.sh`
2. Land on `Dashboard` and answer:
   - money flow
   - system health
   - required actions
3. If critical/warning alerts exist, move to `Alerts` immediately.
4. Execute only scoped interventions:
   - retry GBP ingestion
   - resume Postmark (after checklist)
   - acknowledge alert
5. Spot-check `Campaign Engine` for queued/manual-lane work.
6. Use `Reports` only when monthly proof is needed.
7. Close app.

## Launch Policy (No Hybrid Browser Window)
- Dashboard launch is local Swift Operator only; do not use browser links as the primary path.
- Canonical command:
  - `bash scripts/operator/open-latest.sh`
- Optional override when intentionally testing a non-latest checkout:
  - `bash scripts/operator/open-latest.sh --allow-behind`
- Packaged app launch remains available but is non-authoritative for "latest build":
  - `open "$HOME/Applications/BlackBolt Operator.app"`

## Navigation (Locked IA)
- Dashboard
- Tenants
- Campaign Engine
- Alerts
- Analytics
- Reports
- Settings

## Weekly KPI SOP
1. Review portfolio health score trend.
2. Review attributed bookings and revenue trend.
3. Review unresolved alert age and count.
4. Review worker liveness and last pipeline run recency.

## Release Checklist (Same-SHA Rule)
1. Verify API `/health` returns 200.
2. Verify API + worker startup banners show identical `build_sha`.
3. Verify no worker Redis localhost fallback (`127.0.0.1:6379`).
4. Run smoke script and require pass:
   - `bash scripts/smoke/railway-smoke.sh <apiBaseUrl> <tenantId> <basicAuthOrDash>`
5. Keep `POSTMARK_SEND_DISABLED=1` until explicit final go-live gate.

## Rollback
1. Redeploy prior known-good SHA to both API and worker.
2. Verify same-SHA alignment in boot banners.
3. Re-run smoke script before declaring rollback complete.
