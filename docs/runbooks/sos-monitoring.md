# SOS Monitoring Runbook (Essential)

## Monitoring Scope
- API health
- scheduler execution path
- SOS integration alert volume
- provider send failures

## Scripted Check
Run every 5-15 minutes from cron/automation:
```bash
API_BASE_URL=... TENANT_ID=... DATABASE_URL=... bash scripts/sos/monitor-check.sh
```

## Optional Webhook Alerts
Set:
- `SOS_MONITOR_WEBHOOK_URL`

On failures, `monitor-check.sh` posts concise failure messages.

## What to Alert On
- API health check failure
- scheduler endpoint returning 5xx
- non-zero SOS integration alerts in last 24h

## Daily Report
Capture and review:
- follow-up sends attempted/succeeded/failed
- fax sends attempted/succeeded/failed
- sweep queued/skipped counts

## Incident Response
1. Confirm provider credentials and network reachability.
2. Check latest `integration_alerts` rows for SOS codes.
3. Retry failed action from case endpoint when safe.
4. If recurring, pause sweep (`SOS_FOLLOWUP_SWEEP_DISABLED=1`) and escalate.
