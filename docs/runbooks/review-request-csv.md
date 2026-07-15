# Review Request CSV Dry Run Runbook

## Purpose
Validate a tenant-scoped review/referral request list without sending email and without touching the campaign/send path.

This primitive is intentionally isolated from:
- `Campaign`
- `CampaignRun`
- `DraftMessage`
- `ApprovalItem`
- `CampaignMessage`
- `LinkCode`
- `SendEvent`

## Inputs
Provide these values before running the dry run:
- CSV file path(s)
- sender email
- SOS physical mailing address/footer
- Google review link
- tenant ID

The current dry-run trigger metadata must remain honest:
- `trigger_type=manual_replay_last_3_reviews`

## Example Command

Run from the BlackBolt backend repo:

```bash
npm run ops:review-request:dry-run -- \
  --tenant-id cmoybzkon0000tm3wj7ofru4n \
  --csv "wp_wpforms_entries_cleaned - wp_wpforms_entries_cleaned.csv" \
  --csv "SOS Intake Ledger 2-26- present - Sheet2 (1).csv" \
  --from-email soslactation@gmail.com \
  --business-address "4005 Fernwood Ln Houston, TX 77021" \
  --google-review-link "https://share.google/N94oCQ5jrZ2Zv9sTG" \
  --trigger-type manual_replay_last_3_reviews
```

## Expected Output
The command prints a read-only report with:
- PASS / WARN / FAIL
- CSV files processed
- columns found
- valid recipient count
- skipped duplicate count
- skipped invalid count
- skipped suppressed count
- first 3 masked sample renders
- live-send and send-path mutation flags set to false

## Validation Rules
1. `email` is required in every CSV.
2. `first_name` may come from `first_name`, `mothers_name_first`, or `mother_name`.
3. Recipients are deduped by normalized email across all CSVs.
4. Suppressions and unsubscribes are respected when database access is available.
5. No live send is allowed in this phase.
6. No `Campaign`, `DraftMessage`, `ApprovalItem`, `CampaignMessage`, `LinkCode`, or `SendEvent` rows may be created.
7. If no `DATABASE_URL` is available in the execution shell, suppression lookup is skipped and the report should be treated as `WARN`, not `FAIL`.

## R11B Gate
Only after this dry run is clean may the operator choose a live slice of 10-25 recipients for the first controlled send.

R11B must re-check:
- footer/address
- sender identity
- suppression handling
- batch size
- rollback

## Controlled Live Canary
The first live canary stays isolated from the campaign path and uses a dedicated ledger table:
- `ReviewRequestDelivery`

Live mode requirements:
- `REVIEW_REQUEST_SEND_ENABLED=1`
- `POSTMARK_SEND_DISABLED=1` remains set
- `DATABASE_URL` is available in the execution shell
- `POSTMARK_SERVER_TOKEN` is available
- `POSTMARK_FROM` matches the approved sender email
- `REVIEW_REQUEST_FINGERPRINT_SECRET` is available
- `REVIEW_ALERT_INBOUND_ENABLED=0`
- `--live`
- `--confirm-live SOS-R11B`
- `--batch-key <unique-key>`
- `--limit 10` for the first canary, and never above 25

If suppression lookup is unavailable in live mode, the command must fail closed.

Example live command:

```bash
REVIEW_REQUEST_SEND_ENABLED=1 \
POSTMARK_SEND_DISABLED=1 \
npm run ops:review-request:live -- \
  --tenant-id cmoybzkon0000tm3wj7ofru4n \
  --csv "wp_wpforms_entries_cleaned - wp_wpforms_entries_cleaned.csv" \
  --csv "SOS Intake Ledger 2-26- present - Sheet2 (1).csv" \
  --from-email soslactation@gmail.com \
  --business-address "4005 Fernwood Ln Houston, TX 77021" \
  --google-review-link "https://share.google/N94oCQ5jrZ2Zv9sTG" \
  --trigger-type manual_replay_last_3_reviews \
  --live \
  --confirm-live SOS-R11B \
  --batch-key sos-r11b-canary-001 \
  --limit 10
```

Operational rules for live mode:
- The command prints a masked 10-recipient manifest before sending.
- Duplicate or previously-ledgered recipients are skipped without sending.
- The script writes only HMAC recipient fingerprints plus delivery status metadata.
- No `Campaign`, `CampaignRun`, `DraftMessage`, `ApprovalItem`, `CampaignMessage`, `LinkCode`, or `SendEvent` rows may be created.
- After the batch, disable `REVIEW_REQUEST_SEND_ENABLED` again before the next run.

## Rollback
There is nothing to roll back from the dry-run primitive itself because it does not write send-path state.
If the report looks wrong, fix the CSV inputs or script logic and rerun the command.
For live canaries, leave `ReviewRequestDelivery` rows in place for audit and set `REVIEW_REQUEST_SEND_ENABLED=0` immediately after the batch.
