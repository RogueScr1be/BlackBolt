# SOS WPForms Intake Ledger (Local Stage)

This folder is the local staging copy of the Apps Script project before moving to a private repo.

## Files
- `app/Code.gs`: ledger ingestion logic (DB-primary + email fallback)
- `app/appsscript.json`: Apps Script manifest
- `.clasp.json.example`: template for local clasp binding

## Local staging workflow
1. Install clasp (`npm i -g @google/clasp`).
2. Copy `.clasp.json.example` to `.clasp.json` and set `scriptId`.
3. Run `clasp login`.
4. Pull current remote state first: `clasp pull`.
5. Review diff, then push staged changes: `clasp push`.

## Security
- Keep `.clasp.json` private and out of git.
- Set DB sync secret in Apps Script Script Properties via `setDbSyncSharedSecret()`.
- Never commit production secrets.

## Runtime mode
- DB lane is authoritative when `db_primary_enabled=1`.
- Gmail lane writes only after `email_fallback_minutes` if DB lane did not populate the row first.
