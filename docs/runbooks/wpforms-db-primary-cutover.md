# WPForms DB-Primary Cutover Runbook

## Objective
Enable DB-primary ingestion from WordPress MySQL into Leah's ledger with email fallback only after 15 minutes.

## Source of truth
- DB tables: `wp_wpforms_entries`, `wp_wpforms_entry_fields`
- Scope: all `form_id`
- Mode: forward-only sync

## Artifacts
- Apps Script local stage: `apps-script/sos-intake-ledger/app/Code.gs`
- HostGator sender script: `scripts/sos/wpforms-db-forward-sync.php`

## Step 1: Stage Apps Script source locally
1. In `apps-script/sos-intake-ledger`, create `.clasp.json` from `.clasp.json.example`.
2. `clasp pull` to verify remote mapping.
3. `clasp push` to deploy updated `Code.gs` and `appsscript.json`.

## Step 2: Configure Apps Script secrets
1. In Script Properties, ensure `LEDGER_SPREADSHEET_ID` is set.
2. Run `setDbSyncSharedSecret('<strong-secret>')`.
3. Run `setupLedger()` and confirm sheet tabs:
   - `Intake`
   - `Errors`
   - `Raw Mirror`
   - `Config`

## Step 3: Configure Config sheet knobs
Set and verify:
- `db_primary_enabled=1`
- `email_fallback_enabled=1`
- `email_fallback_minutes=15`
- `db_status_allowlist=completed,publish`
- `db_source_name=hostgator-wpforms-cron`

## Step 4: Install HostGator cron sender
1. Copy `scripts/sos/wpforms-db-forward-sync.php` to HostGator (outside web root).
2. Mark executable: `chmod 700 wpforms-db-forward-sync.php`.
3. Create env file from `scripts/sos/wpforms-db-forward-sync.env.example`.
4. Configure cron env values:
- `WPFORMS_DB_HOST`, `WPFORMS_DB_PORT`, `WPFORMS_DB_NAME`, `WPFORMS_DB_USER`, `WPFORMS_DB_PASSWORD`
- `WPFORMS_APPS_SCRIPT_WEBAPP_URL`
- `WPFORMS_DB_SYNC_TOKEN` (must match Apps Script secret)
- `WPFORMS_DB_STATUS_ALLOWLIST=completed,publish`
5. Cron schedule: every 1-2 minutes.

Example command:
```bash
php /home/<cpanel-user>/scripts/wpforms-db-forward-sync.php
```

Optional wrapper for local/server shell runs:
```bash
bash scripts/sos/run-wpforms-db-forward-sync.sh --dry-run
```

## Step 5: Validation gates
1. DB event appears in `Raw Mirror` with `transform_status=OK`.
2. Same entry appears in `Intake` with:
- `source_lane=db`
- `source_id=wpforms:db:<entry_id>`
- `wpforms_entry_id` populated.
3. Immediate rerun produces no duplicate append for same `entry_id`.
4. Email lane only appends when DB row is missing and message age exceeds 15 minutes.

## Rollback
1. Disable cron job.
2. Set `db_primary_enabled=0` in `Config`.
3. Keep email lane active by setting `email_fallback_enabled=1`.

## Notes
- Do not commit secrets or `.clasp.json`.
- Keep the final Apps Script remote repo private after staging is validated.
