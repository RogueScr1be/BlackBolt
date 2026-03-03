# WPForms Full Go-Live Acceptance - Execution Progress

**Overall Progress:** `56%`
**Execution Date (UTC):** `2026-03-03`
**Environment:** `Leah Google live environment (Apps Script / Gmail / Sheets)`

## Status Key
- 🟩 Done
- 🟨 In Progress
- 🟥 To Do

## Steps
- 🟩 **Step 1: Preflight and operating context lock**
  - 🟩 Authenticated successfully as `soslactation@gmail.com`.
  - 🟩 Confirmed sender identity `consultations@soslactation.com` is WPForms-generated (not a Gmail mailbox login target).
  - 🟩 Confirmed Gmail labels exist: `wpforms/inbox`, `wpforms/processed`, `wpforms/error`.

- 🟩 **Step 2: Binding + setup proof**
  - 🟩 Executed `setLedgerSpreadsheetId()`.
  - 🟩 Executed `getLedgerSpreadsheetContext()`.
  - 🟩 Executed `validateLedgerSpreadsheetBinding()`.
  - 🟩 Executed `setupLedger()`.
  - 🟩 Executed `testParseSampleEmail()` (`passed` in execution log).

- 🟨 **Step 3: Dry-run gate**
  - 🟩 Executed `dryRunIngestWpformsEmails()`.
  - 🟨 Summary captured, but required fields `spreadsheetId`, `spreadsheetName`, `spreadsheetMode`, `branch` are absent in active script surface.

- 🟥 **Step 4: Fresh-message ingestion proof**
  - 🟥 Submit one brand-new WPForms entry.
  - 🟥 Run `ingestWpformsEmails()` and verify `appended >= 1`.
  - 🟥 Verify Intake row includes `gmail_message_id` and `case_key`.
  - 🟥 Verify Gmail thread labeled `wpforms/processed`.

- 🟨 **Step 5: Idempotency proof**
  - 🟩 Immediate rerun behavior observed on existing queue (`appended=0`, `duplicateMessageSkips=8`).
  - 🟨 Fresh-message-specific idempotency (Step 4 message) still pending.

- 🟥 **Step 6: Error-path proof**
  - 🟥 Submit malformed sample.
  - 🟥 Verify one `Errors` row and `wpforms/error` label.

- 🟥 **Step 7: Volume acceptance**
  - 🟥 Submit 5 real test entries.
  - 🟥 Verify 5 Intake rows within 5 minutes.

- 🟨 **Step 8: Final evidence bundle + PASS record**
  - 🟩 Captured Apps Script execution log screenshot.
  - 🟩 Captured function picker screenshot (shows active function surface).
  - 🟩 Captured Gmail label screenshot.
  - 🟩 Captured site critical-error screenshot.
  - 🟥 Mark full go-live acceptance PASS only after Steps 4/6/7 are complete.

## Active Blockers
- WordPress frontend is returning a critical error (`HTTP 500`), preventing generation of fresh WPForms submissions from the live site.
- Active Apps Script project still lacks expected dry-run summary fields (`spreadsheetId`, `spreadsheetName`, `spreadsheetMode`, `branch`) and does not expose `captureIngestionAudit(...)`.
