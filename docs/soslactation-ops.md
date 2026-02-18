# SOS Lactation Operations Profile

## Purpose
This profile defines the operating contract for SOS Lactation workflow automation work. The system goal is clinical consistency, not document generation in isolation.

Implementation completion gates are enforced by `/Users/thewhitley/Documents/New project/CLAUDE.md` and `/Users/thewhitley/Documents/New project/docs/runbooks/soslactation-implementation.md`. This document governs architecture and canonical-model policy.

## Non-Negotiable Architecture
- Use one canonical patient-case record as the single source of truth.
- Enforce strict field mapping from templates to canonical paths.
- Enter data once and reuse it everywhere (intake, SOAP, pedi intake, follow-up letter, fax packet, reporting).
- Never allow silent mapping drift between templates.

## Canonical Record Model
Every case must persist these top-level objects:
- `case`
- `patient`
- `baby`
- `soap`
- `provider`
- `consent`
- `artifacts`
- `audit`

Required identity parity fields across all consult workflows:
- `patient.parentName`
- `patient.phone`
- `patient.email`
- `patient.address`
- `baby.name`
- `baby.dob`

Required SOAP fields:
- `soap.subjective`
- `soap.objective`
- `soap.assessment`
- `soap.plan`

## Workflow Phases

### Phase 1: Intake + Deposit + Case Creation
- Patient selects consult type: remote video, in-home, insurance, in-office, or phone.
- Intake capture writes into canonical record.
- Stripe deposit success is case creation trigger.
- System creates canonical Drive folder.
- System stores intake artifact(s) and updates master index.

### Phase 2: Consultation + Structured SOAP
- Clinician records SOAP in structured form (web-first, PDF output artifact).
- SOAP remains canonical and reusable for downstream documents.

### Phase 2b: Pedi Intake Packet Generation
- Generate pedi intake using canonical intake + SOAP values.
- Preserve unmapped values explicitly for manual completion.
- Save generated pedi intake PDF in case folder.

### Phase 3: Post-Consult Outputs
- Generate personalized follow-up letter from canonical data and clinician notes.
- Generate provider fax packet with findings, assessment, plan, and recommendations.
- Save rendered artifacts and transmission metadata in case folder.

### Phase 4: Follow-Up and Referral Automation (30-60 days)
- Scheduled check-ins from last visit date.
- Review/referral asks are automated and auditable.
- Responses can be linked back to case timeline.

## Template and Mapping Governance
- Each template has immutable metadata: `templateId`, `version`, source file, status.
- Each template must have:
  - `fields.json` (detected field inventory)
  - `mapping.json` (template field to canonical path)
- Any template wording/layout change requires a version bump and mapping review.
- `unmapped: true` is allowed only with explicit reason.

## Plugin Boundaries
- PDF inspector/editor: discovers and versions field inventories.
- PDF filler: fills/merges/optionally flattens packets.
- Template engine: handles docx/email variable rendering.
- Drive manager: creates folders and stores artifacts.
- Stripe trigger: payment webhook to case creation.
- Fax adapter: provider-agnostic transport abstraction.
- Scheduler: delayed follow-up workflows.

## Anti-Drift Rules
- Shared identity fields must map to the same canonical paths across all consult types.
- No per-template renaming of canonical keys.
- No downstream template should become source-of-truth for identity data.
- Mapping exceptions must be documented and reviewable.

## Defaults in This Repository
- SOAP implementation target: structured web capture with canonical storage and PDF output.
- Source templates are currently stored at `/Users/thewhitley/SOS form automation forms/`.
- This phase delivers schema/mapping/documentation foundation only; no production integrations are shipped here.

## SEO Operations Addendum
- Website SEO operations for `soslactation.com` are governed by:
  - `/Users/thewhitley/Documents/New project/docs/runbooks/soslactation-wordpress-seo.md`
- Use this profile (`soslactation-ops.md`) for clinical workflow automation architecture and canonical record governance.
- Use the SEO runbook for WordPress indexation/canonical/sitemap/CWV/local SEO execution.
- Cross-domain rule:
  - clinical template mapping changes must not silently alter public website SEO metadata workflows.
  - SEO plugin/performance stack changes must not alter canonical patient-case schema or template mappings.
