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
- Objective gates are mandatory for go-live:
  - Rollout preflight (fail-fast context check): `npm run objective:rollout:preflight`
  - Shadow gate: `npm run objective:verify:shadow -- <apiBaseUrl> <tenantId> <operatorKey> <authOrDash> <YYYY-MM>`
  - Live gate: `npm run objective:verify:live -- <apiBaseUrl> <tenantId> <operatorKey> <authOrDash> <YYYY-MM>`
  - Shadow rollout wrapper: `npm run objective:rollout:shadow -- <apiBaseUrl> <tenantId> <operatorKey> <expectedBuildSha> <authOrDash> <YYYY-MM>`
  - Live rollout wrapper: `npm run objective:rollout:live -- <apiBaseUrl> <tenantId> <operatorKey> <expectedBuildSha> <authOrDash> <YYYY-MM>`
  - Stabilization monitor: `npm run objective:rollout:stabilize -- <apiBaseUrl> <tenantId> <operatorKey> <durationMinutes> <intervalMinutes> <authOrDash> <YYYY-MM>`

## Rollout Context Guard
- Canonical rollout working directory: `/Users/thewhitley/.codex/worktrees/749b/New project`
- If you see `Missing script: "objective:rollout:*"` you are in the wrong repo/worktree.
- If you see `Service '<name>' not found` Railway is linked to the wrong project/environment.
- Recovery sequence:
  1. `cd "/Users/thewhitley/.codex/worktrees/749b/New project"`
  2. `railway link` (choose project `BlackBolt`, environment `production`)
  3. `railway status`
  4. `npm run objective:rollout:preflight`

## Operator Launch (Daily Standalone App)
- Primary daily path is the installed macOS app in `~/Applications/BlackBolt Operator.app`.
- Build + install/update in one command:
  - `npm run operator:install`
- Use source-run freshness guard only for developer verification:
  - `bash scripts/operator/open-latest.sh`

## Click-and-Live Bootstrap
1. Deploy API + worker on same SHA and set `BUILD_SHA` to that SHA on both services.
2. Apply migrations:
   - `npm run prisma:migrate:deploy`
3. Seed tenant + operator key:
   - `npm run tenant:seed -- --name="Your Tenant" --slug=your-tenant`
4. Install/open Operator app:
   - `npm run operator:install`
5. Configure app settings:
   - API Base URL: Railway API domain
   - Tenant ID: `tenantId` from seed output
   - Operator Key: `operatorKey` from seed output
6. Run smoke check:
   - In app: `Smoke Test`
   - API equivalent: `POST /v1/tenants/{tenantId}/operator/smoke`
