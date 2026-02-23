# Operator App Runbook (macOS Dock Launch)

## Build a Dock-Launchable App Bundle
From repo root:

```bash
npm run operator:package
```

This generates:

- `dist/BlackBolt Operator.app`

## Install for Daily Use
1. Run:
   ```bash
   npm run operator:install
   ```
2. If installing manually, drag `dist/BlackBolt Operator.app` into `/Applications` (or `~/Applications`).
3. Launch the app once.
4. Right-click the Dock icon and choose **Options -> Keep in Dock**.

## Runtime Settings (inside app)
- API base URL: your Railway API domain
- Tenant ID: output from `npm run tenant:seed`
- Operator Key (`X-Operator-Key`): output from `npm run tenant:seed` (shown once)
- Auth header: optional (`Basic ...`, `Bearer ...`, or raw `user:pass`)

## Revenue Imports Workflow (Operator App)
1. Open the `Imports` sidebar tab.
2. Click `Upload Revenue CSV`.
3. Use canonical CSV headers only:
   - required: `occurred_at,amount_cents,currency`
   - optional: `external_id,customer_email,customer_phone,description,campaign_message_id,link_code,provider_message_id`
4. Select an import row to view status and row-level validation errors.
5. After import reaches terminal state, dashboard cards refresh with import health + customer segment summaries.

## Tenant Bootstrap (Per-Tenant Key Flow)
Run from repo root:

```bash
npm run tenant:seed -- --name="Your Tenant" --slug=your-tenant
```

Use the printed values:
- `tenantId` -> Operator app `Tenant ID`
- `operatorKey` -> Operator app `Operator Key`

## If Buttons Don't Work
| Symptom | Likely Cause | Fix |
|---|---|---|
| `Invalid operator key` / HTTP 401 | Wrong `Operator Key` value | Update key in Settings and retry |
| `Invalid operator key` after rotation | Old key cached in app | Replace with the newest key from rotate/seed output |
| `Endpoint not available` / HTTP 404 | Wrong `API Base URL` or stale API deployment | Point to canonical API URL and verify latest deploy |
| `Cannot reach API base URL` | DNS/network/connectivity issue | Verify URL, network, and Railway/API availability |
| `Missing required settings` | Empty API URL / Tenant ID / Operator Key | Fill required fields in Settings |

## Manual QA Checklist (Sidebar Interactions)
1. Click each sidebar tab (`Dashboard`, `Imports`, `Tenants`, `Campaign Engine`, `Alerts`, `Analytics`, `Reports`, `Settings`).
2. Confirm sidebar selection highlight changes.
3. Confirm main navigation title matches selected tab.
4. Confirm content pane updates for each selected tab.
5. Confirm at least one tab action is responsive (for example `Refresh`, `Retry`, `Generate`, `Pause`, or `Resume` when available).

## Release Blocker
- Do not ship Operator app updates unless the manual QA checklist above is completed on the installed app at `~/Applications/BlackBolt Operator.app` (not only from source-run).

## Fallback Developer Launch
```bash
bash scripts/operator/open-latest.sh
```

## Objective Closure (Shadow -> Staged Live)
Tenant used for production validation:
- `cmlqpv2il000022nkqb7llq4z`
Baseline release SHA:
- `08117220909eab602f95b0e27ebc9c823812522b`

### Stage 1: 24h Shadow Validation (Gate B)
1. Keep:
   - `POSTMARK_SEND_DISABLED=1` on `blackbolt-api` and `blackbolt-worker`.
   - `GBP_POLL_SCHEDULER_DISABLED` unset (or `0`) on worker.
2. Let production run for 24h.
3. Run:
   ```bash
   npm run objective:verify:shadow -- \
     https://blackbolt-api-production.up.railway.app \
     cmlqpv2il000022nkqb7llq4z \
     "<current_operator_key>" \
     - \
     "$(date -u +%Y-%m)"
   ```
4. Expected:
   - endpoint checks return `200/201`;
   - monthly CSV + PDF exports are valid;
   - output ends with `Gate B: PASS`.

Optional DB counters:
- Set `DATABASE_PUBLIC_URL` in your shell before command run to print read-only campaign/message counters.

### Stage 2: Tenant-Scoped Live Pilot (Gate C)
1. Flip env vars:
   - `POSTMARK_SEND_DISABLED=0` on `blackbolt-api`
   - `POSTMARK_SEND_DISABLED=0` on `blackbolt-worker`
2. Redeploy both services with same-SHA discipline.
3. Run:
   ```bash
   npm run objective:verify:live -- \
     https://blackbolt-api-production.up.railway.app \
     cmlqpv2il000022nkqb7llq4z \
     "<current_operator_key>" \
     - \
     "$(date -u +%Y-%m)"
   ```
4. Expected:
   - output ends with `Gate C: PASS`;
   - run/message sent metrics are non-zero;
   - click evidence appears in monthly totals.

Gate scripts:
- Shadow gate script: `scripts/smoke/objective-shadow-verify.sh`
- Live gate script: `scripts/smoke/objective-live-verify.sh`
- Rollout shadow wrapper: `scripts/smoke/objective-rollout-shadow.sh`
- Rollout live wrapper: `scripts/smoke/objective-rollout-live.sh`
- Stabilization window checker: `scripts/smoke/objective-rollout-stabilize.sh`

### Stage 3: Stabilization and Rollout Expansion
1. Hold at least 24h stabilization after live pilot.
2. Monitor:
   - critical alert feed;
   - worker restarts/health;
   - report JSON/PDF coherence.
3. Expand tenant-by-tenant only if no unresolved critical alerts.

### Recovery
If pilot fails, revert immediately:
1. Set `POSTMARK_SEND_DISABLED=1` on API and worker.
2. Redeploy both services on the same known-good SHA.
3. Re-run shadow verification before another live attempt.
