# Operator Command Center Runbook

## Daily Operator SOP (<10 minutes)
1. Open `BlackBolt Operator.app` from Dock (installed in `~/Applications`).
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
- Daily path is the standalone macOS app (`~/Applications/BlackBolt Operator.app`).
- Install/update the app bundle from repo root:
  - `npm run operator:install`
- Developer fallback for latest-source verification:
  - `bash scripts/operator/open-latest.sh`
- Do not use browser links as the primary Operator dashboard path.

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

## SOS WPForms Ledger Lane (DB-Primary + Email Fallback)

### Operating policy
1. Primary source is WordPress MySQL (`wp_wpforms_entries` + `wp_wpforms_entry_fields`) for `form_id=2495`.
2. Status allowlist is strict: `completed` and `publish`.
3. Email ingestion remains enabled only as fallback.
4. Fallback is allowed only when the DB row is still missing after `WPFORMS_EMAIL_FALLBACK_MINUTES`.
5. Idempotency must be stable across lanes:
   - DB lane key: `wpforms:db:{entry_id}`
   - Email lane key: `wpforms:email:{gmail_message_id}`
   - Ledger write must keep source marker + source ID to prevent duplicate Intake rows.

### Full go-live acceptance checklist (no waivers)
1. Binding/setup:
   - `setLedgerSpreadsheetId()`, `getLedgerSpreadsheetContext()`, `validateLedgerSpreadsheetBinding()`, `setupLedger()`, `testParseSampleEmail()`.
2. Dry run:
   - `dryRunIngestWpformsEmails()` includes required summary fields (`queryBase`, `query`, `spreadsheetId`, `spreadsheetName`, `spreadsheetMode`, `branch`).
3. Fresh ingest:
   - one new WPForms submit -> `ingestWpformsEmails()` shows `appended >= 1`.
   - Intake row includes `gmail_message_id` and `case_key`.
   - Gmail thread has `wpforms/processed`.
4. Idempotency:
   - immediate rerun does not append duplicate Intake row for the same message.
5. Error path:
   - malformed sample writes one `Errors` row and applies `wpforms/error`.
6. Volume:
   - 5 fresh test submits produce 5 Intake rows within 5 minutes.

### Evidence bundle requirements
1. Save timestamped function outputs for setup, dry run, fresh run, rerun, and malformed run.
2. Capture Intake and Errors sheet screenshots for matching rows.
3. Capture Gmail label screenshots (`wpforms/processed`, `wpforms/error`).
4. Record final acceptance as PASS only when all checklist items pass.
