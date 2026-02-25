# SOS WPForms Ingestion Fallback Evidence

Use this when `captureIngestionAudit` is not available in Apps Script.

## Context
- Run date/time (local + UTC):
- Operator account:
- Apps Script project name:
- Expected spreadsheet ID: `1BQWQDzoooLs57vXCAOVkePeXX5Vlv85RSQQgqDdtR18`

## Step 1: Script Surface
- [ ] `getLedgerSpreadsheetContext` visible
- [ ] `validateLedgerSpreadsheetBinding` visible
- [ ] `getConfig` visible
- [ ] `dryRunIngestWpformsEmails` visible
- [ ] `ingestWpformsEmails` visible
- [ ] `captureIngestionAudit` visible (optional)

## Step 2: Binding Proof
### `getLedgerSpreadsheetContext()` output
```json
{}
```

### `validateLedgerSpreadsheetBinding()` output
```json
{}
```

Required checks:
- [ ] `spreadsheetId` equals expected ID
- [ ] `idFormatValid=true`
- [ ] `openByIdOk=true` or `openByUrlOk=true`

## Step 3: Query Proof
### `getConfig()` output
```json
{}
```

### `dryRunIngestWpformsEmails()` output
```json
{}
```

Required checks:
- [ ] `queryBase` present
- [ ] `query` present
- [ ] `spreadsheetId` present
- [ ] `spreadsheetName` present
- [ ] `spreadsheetMode` present
- [ ] `branch` present (`QUERY_MISS`, `DEDUPE_PATH`, `PARSE_OR_VALIDATION_PATH`, `SUCCESS`)
- [ ] `messageCount > 0` when fresh inbox candidates exist

## Step 4: Ingest Proof
### `ingestWpformsEmails()` output
```json
{}
```

Required checks:
- [ ] `appended >= 1` for fresh submission
- [ ] `Intake` contains new row with `gmail_message_id` and `case_key`
- [ ] Gmail thread shows `wpforms/processed`

## Branch Classification (if `appended=0`)
- [ ] `messageCount=0` -> Query/filter mismatch
- [ ] `duplicateMessageSkips>0` or `duplicateErrorSkips>0` -> Dedupe path
- [ ] `errors>0` -> Parse/required-fields path
- [ ] Lock `DEDUPE_PATH` when `duplicateMessageSkips>0` and `errors=0`

If `captureIngestionAudit` is available, also capture:
- [ ] `candidateScan.sample[*].messageId`
- [ ] `candidateScan.sample[*].state`
- [ ] `candidateScan.duplicateMessageEvidence[*].messageId`
- [ ] `candidateScan.duplicateMessageEvidence[*].intakeRow`
- [ ] Each duplicate `messageId` exists in `Intake.gmail_message_id`

## Evidence Links/Screenshots
- Binding screenshot:
- Dry-run log screenshot:
- Ingest log screenshot:
- Intake row screenshot:
- Processed-label screenshot:
