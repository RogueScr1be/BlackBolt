# Leah SOS Quickstart (Handoff)

## What Leah Receives
A single folder bundle containing:
- forms/templates
- env templates
- setup/check scripts
- runbooks and troubleshooting

## First-Time Setup
1. Install required apps:
- Node.js 24
- access to SOS API URL
- access to credentials manager for Stripe/Drive/Google Workspace and fax provider creds
2. Fill env files:
- `.env.api`
- `.env.worker`
3. Keep `SOS_FAX_PROVIDER=srfax` for baseline production.
4. Use `SOS_FAX_PROVIDER=ictfax` only in pilot runtime.
5. Validate preflight:
```bash
npm run sos:preflight
```

## Leah PC Install Checklist
1. Confirm browser access to SOS API domain and operator UI endpoints.
2. Copy `.env.api` and `.env.worker` from package `env/` and fill real values.
3. Run:
```bash
npm run sos:preflight
```
4. Run smoke scripts in order:
```bash
bash scripts/sos/stripe-smoke.sh
export CASE_ID="<case_id_from_stripe_smoke>"
npm run sos:smoke:phase6-7
```
5. Run monitoring checks:
```bash
bash scripts/sos/monitor-check.sh
npm run sos:report:daily
```

## Daily Operations
1. Intake/payment events flow automatically from webhook.
2. Use case actions for follow-up and provider fax.
3. Sweep runs daily automatically; manual override available.

## Live Health Check
```bash
bash scripts/sos/monitor-check.sh
```

## Escalation Triggers
- preflight failure
- stripe smoke failure
- follow-up or fax send failure alerts
- daily sweep failures
- ictfax auth/connectivity failure in pilot (`SOS_ICTFAX_*` checks)

## Go-Live Rollback + Escalation Path
1. Pause sweep: set `SOS_FOLLOWUP_SWEEP_DISABLED=1` on worker.
2. Roll back both services to previous known-good deploy.
3. Re-run `npm run sos:preflight` and `bash scripts/sos/monitor-check.sh`.
4. Escalate with: failing command, timestamp, tenant id, case id, and `integration_alerts` codes.

## ICTFax Pilot Notes
1. ICTFax runs on a dedicated VM and is integrated by setting:
   - `SOS_FAX_PROVIDER=ictfax`
   - `SOS_ICTFAX_BASE_URL`
   - `SOS_ICTFAX_API_USER`
   - `SOS_ICTFAX_API_PASSWORD`
2. Keep production baseline on SRFax during pilot.
3. Promote only after two consecutive green pilot gate runs; rollback by switching provider back to `srfax`.
