# SOS Alert Matrix (Essential)

## Primary Alert Conditions
- `SOS_FOLLOWUP_SEND_FAILED`
- `SOS_PROVIDER_FAX_FAILED`
- `SOS_FOLLOWUP_SWEEP_FAILED`
- API health unavailable
- Scheduler endpoint 5xx

## Routing
- Primary: operator email distribution
- Secondary: webhook channel (Slack/Teams/Pager)

## Expected Response Time
- Business hours: <= 15 minutes
- Off-hours critical failures: <= 60 minutes

## Resolution Notes
Record for each incident:
- first detection timestamp
- impacted case ids
- provider/system root cause
- remediation action
- prevention follow-up
