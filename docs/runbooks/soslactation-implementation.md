# SOS Lactation Implementation Runbook

## Purpose
This runbook defines executable SOS Lactation delivery gates. It is designed to prevent documentation-only completion for implementation requests.

## End-State UX Contract

### Client Experience
1. Visit `soslactation.com/book`.
2. Select consult type (`remote_video`, `in_home`, `insurance`, `in_office`, `phone`).
3. Complete form and pay deposit.
4. Receive confirmation email and intake copy.

### Leah Operator Experience
1. Open one SOS Console page.
2. See `New Paid Cases`, `Scheduled Today`, and `Follow-ups Due`.
3. Open a case and access one-click actions:
   - Open Folder
   - SOAP Notes
   - Generate Pedi Intake
   - Send Follow-up
   - Send Provider Fax

### System Experience
- Case creation is triggered by successful payment webhook.
- Case folder structure and file naming are deterministic.
- Canonical identity and SOAP data are reused across all outputs.
- Jobs are idempotent with retries and audit logs.

## Phase Checklist and Entry/Exit Gates

### Phase 0: Repo Readiness
Entry criteria:
- SOS profile active in `CLAUDE.md`.
- Canonical schema + template registry present.

Exit criteria:
- `npm run sos:extract-fields` runs successfully.
- Field inventories updated for all configured templates.
- Non-fillable templates are explicitly classified.

### Phase 1: Template Truth and Mapping Integrity
Entry criteria:
- Registry lists all SOS templates and versions.

Exit criteria:
- `npm run sos:check:registry` passes.
- `npm run sos:check:mappings` passes.
- Shared identity parity invariant is enforced across consult mappings.

### Phase 2: Canonical Case Store and Orchestrator
Entry criteria:
- Mapping checks are green.

Exit criteria:
- Case can be created with canonical payload persisted.
- Case appears in operator list.
- Orchestration job records status transitions with retries.

### Phase 3: Intake and Stripe Trigger
Entry criteria:
- Phase 2 exit criteria met.

Exit criteria:
- Stripe test payment creates case.
- Drive folder is created and artifact uploaded.
- Confirmation message is sent and logged.

### Phase 4: Leah Console
Entry criteria:
- Case lifecycle events are persisted.

Exit criteria:
- Operator can execute core actions from one case-detail view.
- Actions produce artifacts and status feedback.

### Phase 5: SOAP and Pedi Generation
Entry criteria:
- Console actions framework is live.

Exit criteria:
- SOAP form writes canonical `soap.*`.
- SOAP PDF artifact is generated.
- Pedi Intake can be generated from canonical payload and stored.

### Phase 6: Follow-up Letter and Provider Fax
Entry criteria:
- SOAP and pedi generation available.

Exit criteria:
- Follow-up letter action renders and sends output and stores artifact.
- Provider fax packet action renders, sends, and logs delivery status.

### Phase 7: 30-60 Day Scheduler
Entry criteria:
- Visit timestamps are persisted.

Exit criteria:
- Daily scheduler enqueues and sends check-in/review/referral touches.
- Send outcomes and artifacts are auditable.

## Acceptance Tests (Executable)
- `npm run sos:extract-fields`
  - Must produce non-empty pedi intake fields.
  - Must report consult PDFs as non-fillable templates when no fields are detected.
- `npm run sos:check:registry`
  - Must validate required registry keys and referenced files.
- `npm run sos:check:mappings`
  - Must validate mapping structure and shared identity parity across consult templates.
- `npm run sos:check`
  - Aggregates registry + mapping checks.

## Failure Policy
- Jobs must be idempotent by deterministic keys.
- Retries must use bounded attempts with terminal failure status.
- Dead-letter queue (or equivalent terminal-failure state) required after retry exhaustion.
- Every external side effect (email, fax, artifact upload) must be recorded in audit log.

## Blocker Protocol Template
When blocked, report using this exact structure:

- Blocker:
  - exact external dependency or constraint.
- Evidence:
  - commands run and outcome summary.
- Unblocked Progress:
  - concrete completed work that does not require the blocker.
- Next Executable Step:
  - immediate next action once blocker is removed.

## Explicit Current Template Reality
- `pedi-intake` currently has machine-readable fields.
- The five consult PDFs currently have no machine-readable AcroForm/XFA fields and must be treated as static templates until new fillable versions are provided.
