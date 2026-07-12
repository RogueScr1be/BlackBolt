# Review Loop Ops Runbook

## Purpose
Keep the SOS review loop observable with one read-only check command, one panic-disable path, and no new vendors or infrastructure.

## Daily Check
Run the production read-only probe inside the Railway service shell so it can reach the private DB:

```bash
railway ssh -s blackbolt-api -- sh -lc 'cd /app && npm run ops:check:review-loop'
```

Optional parity check against the worker service:

```bash
railway ssh -s blackbolt-worker -- sh -lc 'cd /app && npm run ops:check:review-loop'
```

Expect:
- `API /health = 200`
- worker heartbeat present
- latest GBP `JobRun` succeeded and is not stale
- compiled `GbpClient` `reviews.list` succeeds
- `Review`, `ReviewClassification`, `ReviewQueueItem`, and `ReviewOperatorAction` are sane
- send-path tables remain `0`
- flags remain:
  - `GBP_POLL_SCHEDULER_DISABLED=0`
  - `POSTMARK_SEND_DISABLED=1`
  - `REVIEW_ALERT_INBOUND_ENABLED=0`

## Weekly Check
Run the same command against both services and compare the outputs.

If the worker and API disagree on token resolution or heartbeat freshness, treat the worker as suspect first and inspect its deployment/logs before changing scheduler state.
This command assumes the deployed service includes the `scripts/ops/check-review-loop.ts` file. If the container is still on an older deploy, redeploy the current SHA first.

## Panic Disable
If Google auth fails, JobRuns fail repeatedly, send-path rows appear, review counts duplicate, or the command center breaks in a way that blocks ops:

```bash
railway variable set -s blackbolt-api GBP_POLL_SCHEDULER_DISABLED=1
railway variable set -s blackbolt-worker GBP_POLL_SCHEDULER_DISABLED=1
```

Then redeploy or restart both services if Railway requires it.

## Failure Decision Tree
- Google auth fails: disable scheduler, refresh token material, then re-run the check.
- JobRuns fail repeatedly: disable scheduler, preserve logs, and inspect the last successful GBP poll timestamp.
- Send-path rows appear: disable scheduler immediately and investigate before any other change.
- Command center breaks: keep scheduler on if ingestion is still healthy, but treat the operator UI as degraded.
- Review counts duplicate: disable scheduler and inspect idempotency before retrying.

## Evidence to Preserve
- command output from the read-only check
- latest JobRun rows
- worker heartbeat timestamp
- any integration alerts already created by the runtime

## What Not to Touch
- do not enable sends
- do not enable Postmark fallback
- do not add new monitoring vendors
- do not create private outreach rows
- do not infer customer identity from public reviews

## Rollback
If a runtime change is needed later, revert the last operational change and keep `POSTMARK_SEND_DISABLED=1` and `REVIEW_ALERT_INBOUND_ENABLED=0` while verifying the scheduler state.
