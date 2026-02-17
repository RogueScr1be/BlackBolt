# CLAUDE Guardrails

## Execution Environment
- Before any work, run `pwd && ls -la` and locate uploaded artifacts via `find . -maxdepth 4 -name '*.zip'`.
- In sandbox environments, never reference `/Users/*` blindly or search home directories first; verify mounted writable paths before acting.

## Governance
- Work in explicit phases with entry/exit criteria; do not start the next phase until current phase gates pass.
- For every phase, report: files changed, commands run with outcomes, blast radius, and rollback steps.
- Keep changes minimal and reversible; prefer scaffolding and placeholders over speculative feature work.
- Record all non-obvious architectural/tooling choices in `/Users/thewhitley/Documents/New project/docs/decision-log.md` before expanding scope.
- If a requested governance skill is unavailable, mirror its enforcement rules here and continue with deterministic execution.
- Node version must match `/Users/thewhitley/Documents/New project/.nvmrc` exactly for local and CI runs.
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
- Canonical Operator dashboard launch path is `bash scripts/operator/open-latest.sh` (source-run + SHA freshness check); do not use browser links as authoritative launch.
