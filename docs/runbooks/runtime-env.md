# Runtime Environment Runbook

## Required Environment Variables

### `blackbolt-api`
- `DATABASE_URL`
- `REDIS_URL` optional

### `blackbolt-worker`
- `DATABASE_URL`
- `REDIS_URL`

Startup fails fast for required variables per role.

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
- `POSTMARK_WEBHOOK_BASIC_AUTH_CURRENT` (preferred)
- `POSTMARK_WEBHOOK_BASIC_AUTH` (legacy alias)
- `POSTMARK_WEBHOOK_BASIC_AUTH_PREVIOUS` (optional, during credential rotation)
- `POSTMARK_WEBHOOK_IP_ALLOWLIST` (optional, comma-separated)
- `POSTMARK_WEBHOOK_TRUST_PROXY_HEADERS=0` by default; when set to `1`, the Postmark review-alert route resolves source IP from forwarded headers only if the request arrives through an expected proxy/private socket context and basic auth still passes
- Google review alert shadow adapter envs:
- `REVIEW_ALERT_INBOUND_ENABLED=0` by default
- `REVIEW_ALERT_INBOUND_TENANT_ID=cmoybzkon0000tm3wj7ofru4n`
- `REVIEW_ALERT_ALLOWED_FROM_DOMAINS=google.com,googlebusinessprofile-noreply@google.com`
- `REVIEW_ALERT_ALLOWED_RECIPIENT` (optional, future inbound mailbox)
- `REVIEW_ALERT_STORE_RAW=0` by default; reserved for future debugging, do not persist full raw email in this phase
- `POSTMARK_WEBHOOK_DIAGNOSTIC_MODE=0` by default; logs redacted ingress source data and returns a no-op without parsing or persistence

### `blackbolt-worker`
- Queue/sweeper tuning envs (optional):
- `POSTMARK_SEND_SWEEPER_DISABLED`
- `POSTMARK_SEND_SWEEPER_EVERY_MS`
- `POSTMARK_SEND_MAX_ATTEMPTS`
- Worker heartbeat envs (optional, defaults shown):
- `WORKER_HEARTBEAT_KEY=blackbolt:worker:heartbeat`
- `WORKER_HEARTBEAT_INTERVAL_MS=30000`
- `WORKER_HEARTBEAT_TTL_SECONDS=300`
- `HEALTH_WORKER_HEARTBEAT_MAX_AGE_MS=900000`

## Safe Initial Defaults
- Keep `POSTMARK_SEND_DISABLED=1` until shadow checks are complete.
- Do not unset this flag until explicit go-live approval.
- Keep `GBP_POLL_SCHEDULER_DISABLED` unset or `0` on worker during shadow/live validation windows.
- Keep worker heartbeat defaults unless rollout diagnostics require temporary tuning.

## Revenue Import Runtime Contract
- Canonical tenant-scoped endpoints:
- `POST /v1/tenants/{tenantId}/revenue/imports`
- `GET /v1/revenue-imports/{revenueImportId}`
- `GET /v1/tenants/{tenantId}/revenue/imports`
- Canonical CSV schema is strict:
- required headers: `occurred_at`, `amount_cents`, `currency`
- optional headers: `external_id`, `customer_email`, `customer_phone`, `description`, `campaign_message_id`, `link_code`, `provider_message_id`
- unsupported headers are rejected at parse boundary.

## Env Validation Checklist
1. In Railway, verify both services inherit project-wide `DATABASE_URL` and `REDIS_URL`.
2. Verify no empty-string values.
3. Verify neither service has stale Redis override values (for example `127.0.0.1:6379`).
4. Prefer Railway internal Redis URL for worker when both services are in the same Railway project.
5. Set identical `BUILD_SHA` on both services.
6. Deploy both services on the same commit SHA.
7. Confirm startup banners show expected role and the same `build_sha` value for API + Worker.
8. Confirm logs show successful startup without missing-env errors.

## Local Operator Defaults
- Default operator API base URL: `https://blackbolt-api-production.up.railway.app`
- Operator tenant ID is persisted locally in app settings.
- Operator auth is tenant-scoped (`x-tenant-id` + `x-operator-key`) backed by `operator_credentials`.
- Do not configure or depend on a global `OPERATOR_KEY` env var.
- Bootstrap/rotate operator keys via API/seed flow:
  - `npm run tenant:seed -- --name="Your Tenant" --slug=your-tenant`
  - `POST /v1/tenants/{tenantId}/operator/keys/rotate`
- Bootstrap readiness endpoint (tenant-authenticated):
  - `GET /v1/bootstrap/status`
- Optional auth header can be stored as:
- full header value (`Basic ...` or `Bearer ...`)
- or raw `user:pass` (app encodes this into `Basic ...`).
- Launch helper:
- `bash scripts/start-operator.sh`

## Canonical Rollout Scripts
- Mandatory preflight (repo/scripts/Railway context):
- `bash scripts/smoke/objective-rollout-preflight.sh [mode]`
- npm alias:
- `npm run objective:rollout:preflight`
- Shadow preflight + Gate B:
- `bash scripts/smoke/objective-rollout-shadow.sh <apiBaseUrl> <tenantId> <operatorKey> <expectedBuildSha> [authOrDash] [YYYY-MM]`
- Live preflight + Gate C:
- `bash scripts/smoke/objective-rollout-live.sh <apiBaseUrl> <tenantId> <operatorKey> <expectedBuildSha> [authOrDash] [YYYY-MM]`
- Stabilization monitor:
- `bash scripts/smoke/objective-rollout-stabilize.sh <apiBaseUrl> <tenantId> <operatorKey> <durationMinutes> <intervalMinutes> [authOrDash] [YYYY-MM]`

## Context Failure Signatures
- `npm error Missing script: "objective:rollout:shadow"`:
- Root cause: wrong repo/worktree.
- Fix:
  1. `cd "/Users/thewhitley/Documents/New project"`
  2. `npm run objective:rollout:preflight`
- `Service 'blackbolt-api' not found` or `Service 'blackbolt-worker' not found`:
- Root cause: Railway CLI linked to wrong project/environment.
- Fix:
  1. `railway link` (project `BlackBolt`, environment `production`)
  2. `railway status`
  3. `npm run objective:rollout:preflight`

## SOS WPForms DB-Primary Lane Contract

### Required secrets (do not log values)
- `WPFORMS_DB_HOST`
- `WPFORMS_DB_PORT` (default `3306`)
- `WPFORMS_DB_NAME` (current: `soslaion_wp68837`)
- `WPFORMS_DB_USER`
- `WPFORMS_DB_PASSWORD`
- `WPFORMS_LEDGER_SPREADSHEET_ID`

### Required runtime knobs
- `WPFORMS_DB_FORM_IDS=all` (forward-only; no single-form filter)
- `WPFORMS_DB_STATUS_ALLOWLIST=completed,publish`
- `WPFORMS_DB_PRIMARY_ENABLED=1`
- `WPFORMS_EMAIL_FALLBACK_ENABLED=1`
- `WPFORMS_EMAIL_FALLBACK_MINUTES=15` (recommended default unless operator override is approved)

### HostGator cron runtime vars
- `WPFORMS_APPS_SCRIPT_WEBAPP_URL`
- `WPFORMS_DB_SYNC_TOKEN`
- `WPFORMS_DB_BATCH_SIZE` (default `200`)
- `WPFORMS_DB_CURSOR_FILE` (default `/tmp/wpforms_db_forward_cursor.txt`)
- `WPFORMS_DB_SOURCE_NAME` (default `hostgator-wpforms-cron`)

### Gmail label contract (fallback lane)
- `WPFORMS_GMAIL_LABEL_INBOX=wpforms/inbox`
- `WPFORMS_GMAIL_LABEL_PROCESSED=wpforms/processed`
- `WPFORMS_GMAIL_LABEL_ERROR=wpforms/error`

### Dual-lane safety rules
1. DB lane is authoritative for new Intake writes.
2. Email lane may write only when DB lane has not produced that row after `WPFORMS_EMAIL_FALLBACK_MINUTES`.
3. Every write must store lane/source identity so duplicate suppression works across both lanes.
4. Keep secrets in platform secret manager only; never commit credentials to repo or screenshots.

### HostGator sender scripts
- `scripts/sos/wpforms-db-forward-sync.php`
- `scripts/sos/run-wpforms-db-forward-sync.sh`
- `scripts/sos/wpforms-db-forward-sync.env.example`
