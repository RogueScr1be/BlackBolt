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
- access to credentials manager for Stripe/Drive/Postmark/SRFax
2. Fill env files:
- `.env.api`
- `.env.worker`
3. Validate preflight:
```bash
npm run sos:preflight
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
