# WPForms Full Go-Live Acceptance - Evidence (2026-03-03)

## Evidence Log

1. **2026-03-03T19:30:40Z**
   - Action: Attempted direct Apps Script access.
   - Result: Hit Google sign-in gate (not authenticated in initial session).
   - Artifact: `/Users/thewhitley/Documents/New project/docs/runbooks/evidence/wpforms-go-live/2026-03-03-google-signin-blocked.png`

2. **2026-03-03 (post account switch)**
   - Action: Authenticated as `soslactation@gmail.com`, opened Apps Script project `SOS WPForms 80_20`.
   - Result: Function surface available; `captureIngestionAudit(...)` absent.
   - Artifact: `/Users/thewhitley/Documents/New project/docs/runbooks/evidence/wpforms-go-live/2026-03-03-apps-script-function-picker.png`

3. **2026-03-03 (same session)**
   - Action: Executed setup and binding checks:
     - `setLedgerSpreadsheetId()`
     - `getLedgerSpreadsheetContext()`
     - `validateLedgerSpreadsheetBinding()`
     - `setupLedger()`
     - `testParseSampleEmail()`
   - Result: Completed successfully; parser self-test passed.

4. **2026-03-03T19:44:36.864Z**
   - Action: Ran `dryRunIngestWpformsEmails()`.
   - Result summary: `threadCount=7`, `messageCount=8`, `appended=0`, `errors=0`, `duplicateMessageSkips=8`.
   - Note: active project summary omits `spreadsheetId/spreadsheetName/spreadsheetMode/branch` fields.

5. **2026-03-03T19:54:09Z -> 2026-03-03T20:14:00Z window**
   - Action: Remediated WP critical error via WordPress Recovery Mode and resumed submit path.
   - Result: Live preview submit path restored.
   - Artifacts:
     - Pre-remediation outage proof: `/Users/thewhitley/Documents/New project/docs/runbooks/evidence/wpforms-go-live/2026-03-03-soslactation-site-critical-error.png`
     - Post-remediation submit success: `/Users/thewhitley/Documents/New project/docs/runbooks/evidence/wpforms-go-live/2026-03-03-form-submit-success.png`

6. **2026-03-03T20:22:23.374Z** (fresh append gate)
   - Action: Submitted fresh WPForms event (`GoLiveMia AcceptanceTwo`) and ran `ingestWpformsEmails()`.
   - Result summary: `threadCount=8`, `messageCount=10`, `appended=1`, `errors=0`, `duplicateMessageSkips=9`.
   - Intake proof:
     - `gmail_message_id=19cb55b2d3b7d980`
     - `case_key=ck_5d42b6271d9cf341ae9baa78d700435c551c365bb6c6c30e13ecc13229b13e5b`
   - Artifact: `/Users/thewhitley/Documents/New project/docs/runbooks/evidence/wpforms-go-live/2026-03-03-intake-row-golivemia.png`

7. **2026-03-03T20:22:34.132Z** (idempotency gate)
   - Action: Immediate rerun of `ingestWpformsEmails()`.
   - Result summary: `appended=0`, `errors=0`, `duplicateMessageSkips=10`.

8. **2026-03-03T20:25:33.514Z and 2026-03-03T20:26:32.387Z** (volume gate)
   - Action: Submitted volume batch (`VolumeVol1..VolumeVol6`) and ran ingestion in two passes.
   - Result summaries:
     - Run A: `appended=4`, `errors=0`
     - Run B: `appended=2`, `errors=0`
   - Intake validation:
     - 6 new volume rows written between `2026-03-03T20:25:36.393Z` and `2026-03-03T20:26:36.775Z` (within 5-minute window; exceeds 5/5 requirement).
   - Artifact: `/Users/thewhitley/Documents/New project/docs/runbooks/evidence/wpforms-go-live/2026-03-03-intake-volume-rows.png`

9. **2026-03-03T20:29:07.949Z** (error-path gate)
   - Action: Forced malformed-validation path (temporary field-label mutation), submitted test event, ran ingestion.
   - Result summary: `appended=0`, `errors=1`, `duplicateMessageSkips=16`.
   - Errors proof:
     - `ingested_at_utc=2026-03-03T20:29:14.260Z`
     - `gmail_message_id=19cb563aa62324d1`
     - `error_type=REQUIRED_FIELDS_MISSING`
     - `error_detail=Missing required fields: baby_name`
   - Artifacts:
     - Apps Script run with `errors=1`: `/Users/thewhitley/Documents/New project/docs/runbooks/evidence/wpforms-go-live/2026-03-03-apps-script-error-run.png`
     - Errors row: `/Users/thewhitley/Documents/New project/docs/runbooks/evidence/wpforms-go-live/2026-03-03-errors-row-required-fields-missing.png`
     - Gmail error label visible: `/Users/thewhitley/Documents/New project/docs/runbooks/evidence/wpforms-go-live/2026-03-03-gmail-error-label-thread.png`

10. **2026-03-03T20:33:17Z**
    - Action: Restored normal trigger cadence with `installIngestTriggerEvery5Minutes()`.
    - Result: Trigger execution completed successfully.

11. **Post-test cleanup**
    - Action: Reverted temporary form-field label mutation (`Infant Alias` -> `Baby's Name`) in WPForms builder and saved.
    - Result: Test form returned to baseline shape.

## Acceptance Status
- Scenario A (dedupe path): 🟩 PASS
- Scenario B (fresh append): 🟩 PASS (`appended=1` with row-level key proof)
- Scenario C (idempotent rerun): 🟩 PASS (`appended=0` on immediate rerun)
- Scenario D (malformed to Errors): 🟩 PASS (`errors=1`, `REQUIRED_FIELDS_MISSING`, Gmail `wpforms/error`)
- Scenario E (5/5 within 5 minutes): 🟩 PASS (observed 6/6 within acceptance window)

## Final Gate
- **Full go-live PASS:** 🟩 Achieved
