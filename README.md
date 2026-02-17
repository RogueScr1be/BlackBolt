# BlackBolt

BlackBolt 1.0 single-operator command center for review-driven reactivation.

## Locked 1.0 Scope
- Hosted API + hosted worker + local macOS Operator app.
- Operator IA: Dashboard, Tenants, Campaign Engine, Alerts, Analytics, Reports, Settings.
- Deterministic reactivation pipeline from new 5-star genuine-positive reviews.
- Actionable command-center aggregate API + scoped interventions.
- Monthly one-page tenant reporting payload + Operator PDF export.

## Recovery Plan Status
- Phase A: Runtime safety/release gates documented and retained (`POSTMARK_SEND_DISABLED=1` default).
- Phase B: Added `/v1/tenants/:tenantId/operator/command-center` + intervention endpoints.
- Phase C: Replaced tab shell with sidebar `NavigationSplitView` IA and alerts-first banner/badges.
- Phase D: Added deterministic confidence policy + segment/send-window/template gating in ingest workflow.
- Phase E: Added monthly report endpoint and Operator PDF export flow.
- Phase F: Updated runbooks with release checklist, same-SHA rule, rollback and daily/weekly SOPs.

## Safety Defaults
- Keep `POSTMARK_SEND_DISABLED=1` until final production go-live gate.
- Require same `build_sha` across API and worker before declaring release.
- Smoke script is mandatory before release: `bash scripts/smoke/railway-smoke.sh <apiBaseUrl> <tenantId> <basicAuthOrDash>`.

## Operator Launch (Canonical Latest Build)
- Canonical launch path for the Dashboard is source-run with freshness guard:
  - `bash scripts/operator/open-latest.sh`
- This script fetches `origin/main`, compares SHAs, and refuses to launch if local checkout is behind.
- Browser/dashboard URLs are not the canonical Operator launch path.
- Packaged app (`~/Applications/BlackBolt Operator.app`) is secondary and may lag until repackaged.
