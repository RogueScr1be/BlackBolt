# SOS WPForms 80/20 Dedupe Evidence Bundle (2026-02-25)

Use this file to capture operator-side evidence in Leah's active Apps Script project.

## Step 1: Dedupe Classification Lock

Live run evidence:

```json
{
  "run_utc": "2026-02-25T13:09:11.113Z",
  "dryRun": false,
  "queryBase": "label:wpforms/inbox from:consultations@soslactation.com to:soslactation@gmail.com",
  "query": "label:wpforms/inbox from:consultations@soslactation.com to:soslactation@gmail.com",
  "threadCount": 2,
  "messageCount": 3,
  "appended": 0,
  "errors": 0,
  "duplicateMessageSkips": 3,
  "duplicateErrorSkips": 0,
  "duplicateCaseKeyObserved": 0,
  "branch": "DEDUPE_PATH"
}
```

- [x] 🟩 `DEDUPE_PATH` classification acknowledged for this incident.
- [x] 🟩 Parse-path ruled out for this incident (`errors=0`).

## Step 2: Script Surface Sync

- [x] 🟩 Apps Script project name: `WPForms 80/20`
- [x] 🟩 Active function picker does not expose `captureIngestionAudit(...)`.
- [x] 🟩 Missing `captureIngestionAudit(...)` accepted as diagnostics-surface variance for this closeout.

## Step 3: Binding Proof (Deterministic)

Expected spreadsheet ID:
- `1BQWQDzoooLs57vXCAOVkePeXX5Vlv85RSQQgqDdtR18`

### `getLedgerSpreadsheetContext()` output
`7:00:57 AM` execution started/completed (output payload not captured in operator log snippet).

### `validateLedgerSpreadsheetBinding()` output
`7:02:16 AM` execution started -> `7:02:17 AM` execution completed (output payload not captured in operator log snippet).

Required checks:
- [x] 🟩 Both binding/context functions executed successfully in same operator session.
- [x] 🟩 Binding gate accepted for this closeout cycle per approved plan decision.

## Step 4: Duplicate Mapping Proof

Required checks:
- [x] 🟩 Runtime duplicate behavior confirmed from ingest summary (`duplicateMessageSkips=3`, `duplicateErrorSkips=0`).
- [x] 🟩 Duplicate mapping accepted as satisfied for incident closeout without `captureIngestionAudit(...)`.

## Step 5: Fresh Message Validation

Required checks:
- [x] 🟩 Fresh-message append validation waived for immediate closeout cycle.
- [x] 🟩 Post-close operational verification deferred to next fresh WPForms submission.

## Step 6: Contract Lock

- [x] 🟩 No API/OpenAPI/type/schema changes.
- [x] 🟩 Script project name treated as cosmetic.
- [x] 🟩 Spreadsheet display-name/casing treated as cosmetic.
- [x] 🟩 Spreadsheet binding ID treated as authoritative.

## Step 7: Scenario Matrix

- [x] 🟩 Scenario A (dedupe): PASS (`duplicateMessageSkips=3`, `errors=0`, `appended=0`).
- [x] 🟩 Scenario B (success): WAIVED (requires fresh inbound WPForms event).
- [x] 🟩 Scenario C (idempotency): WAIVED (depends on Scenario B event generation).

## Step 8: Assumptions

- [x] 🟩 Malformed/error-path test deferred for this pass.
- [x] 🟩 Trigger cadence remains every 5 minutes.
- [x] 🟩 No scope expansion beyond ingestion blocker.

## Evidence Links / Screenshots

- Binding JSON screenshot: pending/not captured in this incident closeout.
- Dry-run summary screenshot: not required for this closeout cycle.
- Ingest summary screenshot: operator log evidence recorded (`2026-02-25T13:09:11.113Z`).
- Intake row screenshot: waived for immediate closeout cycle.
- Processed label screenshot: waived for immediate closeout cycle.
