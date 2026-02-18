# CLAUDE Guardrails

## New Project Profiles
- For SOS Lactation optimization work (including any request scoped to `soslactation.com` or SOS consultation workflow automation), use `/Users/thewhitley/Documents/New project/docs/soslactation-ops.md` as the governing profile before implementation.
- Keep BlackBolt guardrails active for all non-SOS workflows in this repository.

## SOS Automation Delivery Contract
- Activation:
  - Apply this contract when task scope includes SOS Lactation, Leah workflow, patient forms, SOAP, Drive, Stripe, consult automation, or `soslactation.com` clinical operations.
- Executable spec:
  - Use `/Users/thewhitley/Documents/New project/docs/runbooks/soslactation-implementation.md` as the implementation and acceptance-test source of truth.
- Completion gate (`runnable-or-blocked`):
  - An SOS implementation task is not complete unless at least one runnable workflow slice is shipped with verification evidence.
  - If blocked by external dependency (credentials, external API, template limitation), completion output must include:
    - exact blocker
    - evidence commands and outcome summary
    - minimal unblocked work completed
    - next executable step
- No docs-only closure:
  - Docs/schemas/mappings are milestone artifacts and are not final completion for implementation requests.
- Required phase order for SOS implementation:
  - Foundation -> Mapping integrity -> Case store/orchestrator -> Intake+payment trigger -> Console -> SOAP/Pedi -> Post-consult outputs -> Scheduler.
  - Status updates must include `current phase` and whether phase definition-of-done is met.
- Evidence required before claiming completion:
  - commands run
  - artifacts created
  - test/check results
  - known gaps
  - never claim “works in theory” without execution evidence
- Identity parity invariant:
  - Shared keys must map consistently across consult workflows:
    - `patient.parentName`
    - `patient.email`
    - `patient.phone`
    - `patient.address`
    - `baby.name`
    - `baby.dob`
- Template reality rule:
  - If source PDFs are non-fillable, classify them as static templates and include explicit rendering strategy/version notes. Do not represent static PDFs as field-fillable forms.
- BlackBolt isolation:
  - SOS contract applies only to SOS-activated tasks and does not override BlackBolt release/safety contracts.

## SOS Lactation SEO Playbook
- Objective: maximize speed, technical SEO integrity, and local rankings for Houston intent on `soslactation.com`.
- Canonical execution spec: `/Users/thewhitley/Documents/New project/docs/runbooks/soslactation-wordpress-seo.md`.
- Required execution order: Baseline -> Leakage Stop -> CWV Hardening -> Local SEO -> Content Refresh -> Monitoring.
- Decision defaults:
  - SEO plugin: `Rank Math` (single source of truth for indexation/canonicals/schema controls).
  - Performance plugin: `LiteSpeed Cache` when host stack supports it; otherwise `WP Rocket`.
- Safeguards (non-negotiable):
  - Stage-first with full backup and rollback snapshot before any plugin/config/template changes.
  - Never run overlapping SEO plugins or overlapping optimization/performance stacks.
  - No new SEO/performance/utility plugin may be added without documented reason, owner, and removal plan in `docs/decision-log.md`.
  - Apply noindex controls to test/thin/system surfaces before publishing new SEO content.
- Phase gates (definition of done):
  - Phase 0 Baseline + Safety:
    - Pass only when PSI mobile/desktop baseline is captured for homepage + top 3 service pages, GSC coverage and query/page exports are recorded, plugin inventory is recorded, and rollback artifacts exist.
  - Phase 1 Leakage Stop:
    - Pass only when known test/thin/system URLs are set `noindex`, sitemap includes only canonical indexable URLs, canonicals are normalized, and unnecessary internal links to noindex URLs are removed.
  - Phase 2 CWV Hardening:
    - Pass only when cache/compression/lazy-load/image/font settings are configured on one performance stack, plugin conflicts are removed, and no major template regressions are observed on mobile.
  - Phase 3 Local SEO:
    - Pass only when LocalBusiness or MedicalOrganization (as appropriate), Service, and FAQ schema are validated, NAP/service-area details are consistent, and location pages are unique and internally linked to booking routes.
  - Phase 4 Content Refresh:
    - Pass only when priority legacy posts are updated with current guidance, FAQs, authority signals (IBCLC credentials), and internal booking links.
  - Phase 5 Monitoring:
    - Pass only when monthly CWV/plugin audit cadence and quarterly schema/content refresh cadence are documented and active with tracked query clusters.

## Execution Environment
- Before any work, run `pwd && ls -la` and locate uploaded artifacts via `find . -maxdepth 4 -name '*.zip'`.
- In sandbox environments, never reference `/Users/*` blindly or search home directories first; verify mounted writable paths before acting.

## Governance
- Work in explicit phases with entry/exit criteria; do not start the next phase until current phase gates pass.
- For every phase, report: files changed, commands run with outcomes, blast radius, and rollback steps.
- Keep changes minimal and reversible; prefer scaffolding and placeholders over speculative feature work.
- Record all non-obvious architectural/tooling choices in `/Users/thewhitley/.codex/worktrees/749b/New project/docs/decision-log.md` before expanding scope.
- If a requested governance skill is unavailable, mirror its enforcement rules here and continue with deterministic execution.
- Node version must match `/Users/thewhitley/.codex/worktrees/749b/New project/.nvmrc` exactly for local and CI runs.
- Support `TEST_OFFLINE=1` mode: skip external contract lint tooling, but still run local contract coverage and unit tests.
- Define setup truthfully:
  - First-time setup (networked): `nvm install && nvm use && npm ci` (or `npm install` if lockfile is absent).
  - Subsequent offline-ish runs: no network required only if dependencies are already installed/cached.

## Release Hygiene
- Never ship from a dirty tree for release patches; use `git worktree add -b <branch> ../<clean_dir> HEAD`.
- Release CI must reflect the shipping surface area; legacy suites run in a separate non-blocking lane until repaired.
- CI must run `npm run api:build`; tests passing while build fails is not releasable.
- No “pre-existing” exception for red gates: if it fails on the release branch, fix it or revert it.

## Web Deploy Reality
- If using `expo export -p web`, treat hosting as static only.
- Any `/api/*` expectation must map to explicit serverless deployment or an external backend URL.
- For Railway service domains, ensure `targetPort` matches the app `PORT` used at runtime; mismatches can produce edge `502 Application failed to respond` even when app logs show successful boot.

## Validation Contracts
- Runtime validators return `{ valid, errors }` and must never throw.
- If tests reference missing exported symbols, restore exports via re-export first; only re-implement when no source exists.
- Prisma TypeScript enum types come from generated client, not helper TS files; after schema enum changes, regenerate Prisma client before debugging type unions.
- If modules branch on `process.env.APP_ROLE`, set `APP_ROLE` in the entrypoint before importing role-sensitive modules (use lazy/dynamic import to avoid import-eval races).

## Ingestion Safety
- Customer/suppression imports must stay queue-driven and idempotent (`tenantId + importId`).
- Reject PHI-like CSV columns at ingestion boundaries before persistence.
- Multi-tenant APIs must enforce both tenant header context and route-tenant match.
- Ingestion state transitions must be explicit and consistent: start `RUNNING`, finish `SUCCEEDED`, terminal failure `FAILED`.
- Tenant resolution should tolerate guard execution before interceptors by deriving `tenantId`/`userId` from headers when request context fields are unset.

## Prisma Ops
- If `prisma/schema.prisma` changes, run `npm run prisma:generate` before pushing (CI enforces schema hash sync).
- Prisma migrations are immutable once created; never edit an existing migration file. Add a new forward migration for any delta.
- Local migration recipe:
  - `docker run --name blackbolt-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16`
  - `export DATABASE_URL=\"postgresql://postgres:postgres@localhost:5432/postgres?schema=public\"`
  - `npm run prisma:migrate:deploy`
  - `npm run prisma:generate`

## Security Gate
- No high-severity vulnerabilities are allowed before first tenant onboarding.

## GBP Contract
- Token refs are resolved via `TokenVault` (`resolve`, `rotate`) with deterministic failure codes.
- Do not store full raw GBP review payloads; persist only redacted subset + payload hash.
- Idempotency keys must be stable across retries and include cursor for paginated fetches.

## Postmark Contract
- Phase 5.0 must ship and run in shadow mode before any send logic merges.
- Signature verification must use the exact raw request bytes captured before JSON parsing; never verify against `req.body` or re-stringified JSON.
- Webhook auth must use required HTTP Basic Auth; treat provider signature headers as optional hardening unless officially guaranteed.
- Webhook verification order is fixed: IP allowlist -> Basic Auth -> rate-limit checks -> persistence.
- Webhook response semantics are strict: `200` for accepted/duplicate/no-op, `401` for auth rejection, `500` for transient processing failures.
- Support webhook basic-auth rotation with dual credentials (`current` + `previous`) and track previous-credential usage before retiring old secrets.
- Outbound send workers must use atomic DB claim transitions (`QUEUED` -> `SENDING`) and exit on zero-row claims.
- Treat `deliveryState=SENT && providerMessageId=null` as an invariant violation: alert and stop (never re-send).
- Global safety override: `POSTMARK_SEND_DISABLED=1` forces simulation regardless of tenant policy.
- Resume from pause requires explicit checklist acknowledgment; do not clear pause state implicitly.
- Enforce DB uniqueness for outbound provider IDs (`tenantId + providerMessageId`) and treat it as a release blocker if missing.
- Enforce DB send-state integrity via CHECK constraint: `delivery_state='SENT'` requires `provider_message_id IS NOT NULL`.
- Webhook rejection paths (`bad auth`, `IP deny`, `rate limit`) must not persist webhook event rows.
- CI must run high-value Postmark smoke suites explicitly: `postmark-send.processor.spec.ts` and `postmark-webhooks.spec.ts`.
- Operator-facing SQL in API responses must be read-only (`SELECT` only) and must not include secrets/credentials.
- Operator invariants payload should be extensible (`breaches[]`) with legacy aliases kept only for backward compatibility.
- Stale-claim thresholds must come from a shared constant (no duplicated literals across logic/query text).
- OpenAPI compatibility tripwires must prevent regressions to required legacy fields and non-enum invariant codes.
- When invariant codes are defined in both runtime and OpenAPI, enforce cross-sync with a dedicated contract-sync test.
- Migration SQL files under `prisma/migrations/**/migration.sql` are immutable; CI must fail on edits/deletes/renames outside brand-new migration directories.
- Stale `SENDING` claims must be recovered by sweeper policy (re-queue or fail) with explicit integration alerts.

## BlackBolt 1.0 Recovery Tracking
- Locked IA is now sidebar-first with sections: Dashboard, Tenants, Campaign Engine, Alerts, Analytics, Reports, Settings.
- Command-center aggregate endpoint is canonical for operator landing data.
- Interventions are constrained to retry GBP ingestion, resume Postmark, and ack alert with audit logs.
- Reactivation policy must remain deterministic with confidence gate `0.8` default / `0.9` strict.
- Keep same-SHA release discipline and smoke-script gate as mandatory before live declaration.
- Before reporting verification status, always check local SHA and sync state (`git rev-parse --short HEAD`, `git pull`) to avoid reporting from stale commits.
- Daily Operator dashboard launch path is the installed app (`~/Applications/BlackBolt Operator.app`); `bash scripts/operator/open-latest.sh` is developer fallback for source freshness checks. Do not use browser links as authoritative launch.

## Feature Reality Check
- Before claiming any feature is shipped, verify all of the following:
- Endpoint exists in controller and is present in `contracts/openapi/blackbolt.v1.yaml`.
- Service logic is implemented beyond static placeholder copy.
- UI action is wired to a real network call and handles error states.

## Operator Onboarding Truth
- Tenant onboarding is complete only after running `npm run tenant:seed -- --name=\"...\" --slug=...`.
- The seed output is source-of-truth for `tenantId` (`x-tenant-id`) and `operatorKey` (`x-operator-key`).
- Do not mark operator workflows usable until per-tenant operator credential is present in DB.
