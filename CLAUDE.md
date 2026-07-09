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
- Railway deploys must fail closed on source drift: `BLACKBOLT_REF` is required, the build must print requested/checked-out ref provenance, and the route-bearing Postmark adapter files must exist before the build proceeds. Env flips may not silently rebuild `main`.
- Railway env-flip deploys must also be source-bound at the service config level. A fail-closed Dockerfile is not sufficient if Railway still points `blackbolt-api` at `main`; verify the production service branch before any enabled smoke and keep it pinned to the release-bearing ref.
- If a branch-pinned Railway build can still serve stale code, switch the deploy ref to the exact release commit SHA for the rollout, then verify the live container source and compiled dist before any smoke. Branch pinning alone is not enough if the build layer cache can reuse an older checkout.

## Web Deploy Reality
- If using `expo export -p web`, treat hosting as static only.
- Any `/api/*` expectation must map to explicit serverless deployment or an external backend URL.
- For Railway service domains, ensure `targetPort` matches the app `PORT` used at runtime; mismatches can produce edge `502 Application failed to respond` even when app logs show successful boot.
- BlackBolt Railway production deploys are Dockerfile-based and may clone a pushed Git ref during build; if the local release worktree is missing the deploy wrapper, use a temporary deploy-only wrapper and make sure the target ref is actually pushed before retrying.

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
- Postmark review-alert ingress behind Railway must resolve source IP with a route-scoped helper. Do not widen the allowlist to Railway proxy IPs and do not enable global `trust proxy`; forwarded headers may be trusted only when `POSTMARK_WEBHOOK_TRUST_PROXY_HEADERS=1`, the socket context looks like a proxy/private hop, and basic auth still passes.
- Shadow email-alert adapters must remain disabled by default and shadow-only until an explicit promotion phase; do not wire them into review ingestion or send-path side effects.
- Shadow email-alert audit rows must use `actorUserId: null` unless a real persisted actor exists; do not invent synthetic `User` ids such as `system`.
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
- Locked IA is now sidebar-first with sections: Dashboard, Imports, Tenants, Campaign Engine, Alerts, Analytics, Reports, Settings.
- Command-center aggregate endpoint is canonical for operator landing data.
- Interventions are constrained to retry GBP ingestion, resume Postmark, and ack alert with audit logs.
- Reactivation policy must remain deterministic with confidence gate `0.8` default / `0.9` strict.
- Keep same-SHA release discipline and smoke-script gate as mandatory before live declaration.
- Before reporting verification status, always check local SHA and sync state (`git rev-parse --short HEAD`, `git pull`) to avoid reporting from stale commits.
- Daily Operator dashboard launch path is the installed app (`~/Applications/BlackBolt Operator.app`); `bash scripts/operator/open-latest.sh` is developer fallback for source freshness checks. Do not use browser links as authoritative launch.
- Known pitfall: SwiftUI sidebar can appear inert when selection/tag wiring is incomplete even while network/auth is healthy.

## Operator Sidebar Reliability Guardrail
- Required pre-ship verification for Operator app builds:
- Navigation wiring checks:
- Sidebar `List(selection:)` must use optional selection where needed (`Section?`).
- Every selectable row must include explicit `.tag(section)`.
- Content/title must resolve via safe fallback (for example `selection ?? .dashboard`).
- Post-smoke interaction checks (mandatory):
- After `Smoke Test` passes, verify sidebar highlight changes per click, main title changes per click, and content pane switches per click.
- No-op detection policy:
- If smoke passes but tabs/buttons do not react, classify as UI state/routing regression first, not backend outage, until disproven.
- Settings gate policy:
- Required-field validation must not rely on stale global `invalidConfig` state.
- Any disabled action state must be derived from current form values.
- Release checklist addition:
- Ship is blocked unless manual QA checklist in `docs/runbooks/operator-app.md` is passed on the installed app (`~/Applications/BlackBolt Operator.app`), not only source-run.

## Objective Complete Gates
- Gate A: Operator usability complete
- Smoke passes.
- Sidebar and tab actions react correctly.
- Section-level retry is functional.
- No stale config lock requiring app restart.
- Gate B: Flywheel functional in shadow mode
- Scheduler running (`GBP_POLL_SCHEDULER_DISABLED=0`).
- New eligible review creates campaign run.
- Messages enqueue correctly with `POSTMARK_SEND_DISABLED=1`.
- Reports monthly JSON/PDF generate and include run fields.
- Gate C: Controlled go-live
- Enable live sends tenant-by-tenant.
- Validate `QUEUED -> SENT` transitions, click capture, and revenue attribution linking.
- No unresolved critical alerts during stabilization window.

## Revenue Import Guardrail
- Canonical revenue import schema is strict and additive-only:
- required headers: `occurred_at`, `amount_cents`, `currency`.
- optional headers: `external_id`, `customer_email`, `customer_phone`, `description`, `campaign_message_id`, `link_code`, `provider_message_id`.
- Reject unsupported headers and PHI-like columns at parse boundary before persistence.
- Row-level errors are allowed; import remains partially successful when valid rows exist.
- Report consistency gate is mandatory for release checks:
- monthly JSON totals must align with CSV export values and PDF rendered totals for the same tenant/month.

## Rollout Script Path
- Canonical cutover commands:
- `scripts/smoke/objective-rollout-shadow.sh`
- `scripts/smoke/objective-rollout-live.sh`
- `scripts/smoke/objective-rollout-stabilize.sh`
- Rollback standard:
- set `POSTMARK_SEND_DISABLED=1` on API + worker, redeploy same known-good SHA, re-run shadow gate before attempting live again.

## Immediate Next Moves
1. Sync latest Operator fixes into canonical operating repo if split-repo workflow is active.
2. Rebuild/install app from canonical repo and run full manual checklist.
3. Run a 24-hour shadow validation window on one tenant.
4. Review alert feed, run counters, and monthly report totals.
5. Flip live-send flag for one tenant only.
6. Re-validate attribution/report coherence, then expand rollout.

## Baseline Lock Evidence
- Current working release SHA baseline: `08117220909eab602f95b0e27ebc9c823812522b`.
- Current production validation tenant: `cmlqpv2il000022nkqb7llq4z`.
- Gate scripts are canonical and release-blocking:
- `scripts/smoke/objective-shadow-verify.sh` must finish with `Gate B: PASS`.
- `scripts/smoke/objective-live-verify.sh` must finish with `Gate C: PASS`.

## Feature Reality Check
- Before claiming any feature is shipped, verify all of the following:
- Endpoint exists in controller and is present in `contracts/openapi/blackbolt.v1.yaml`.
- Service logic is implemented beyond static placeholder copy.
- UI action is wired to a real network call and handles error states.

## Tier-1 Phase 0 Guardrails
- Canonical repo for Black Bolt Tier-1 work is `/Users/thewhitley/Documents/New project`. Do not use older worktrees except as explicitly cited historical context.
- Tier-1 execution order is backend-first:
- Phase 0 and Phase 1 focus on backend engine truth, tenant safety, PHI prevention, attribution correctness, and deliverability protection before any SwiftUI expansion.
- Do not treat sparse or functional operator screens as proof that backend feature completeness exists.
- Operator-facing and tenant-facing `/v1` routes require a maintained coverage appendix recording:
- route
- controller file
- applied guards
- tenant resolution mechanism
- membership enforcement mechanism if operator-facing
- current status (`safe`, `partial`, `unsafe`)
- When route safety depends on service-layer filtering rather than explicit controller/guard guarantees, classify it as `partial` until proven otherwise.
- Current operator UI depends on non-versioned routes in `dashboard`, `events`, `alerts`, and `operator-tenants`; treat this as a contract-discipline gap until equivalent backend truth is locked under `/v1`.
- Swift operator networking must converge onto generated `BlackBoltAPI`; do not add new handwritten business-facing transport paths in:
- `clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Models/OperatorRuntimeConfig.swift`
- `clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Networking/OperatorHTTP.swift`
- `clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Models/OperatorShellStore.swift`
- Do not silently clean up duplicate-path or generated clutter during audit phases. Record hygiene risks first, then clean them only in an explicitly approved phase.

## Tier-1 Phase 1 Guardrails
- Tenant-facing operator endpoints under `/v1` must use both `OperatorKeyGuard` and `TenantGuard` unless the route is intentionally public by product design.
- When a tenant-scoped route omits `:tenantId` in the path (for example import-status lookups), the request still fails closed through `x-tenant-id` and the backing service query must scope by `{ id, tenantId }`.
- Portfolio operator routes are only `safe` when the controller passes `allowedTenantIds` through to service methods that re-check tenant ownership before lookup or mutation.
- PHI prevention must happen before persistence:
- reject unsupported import headers at parse boundary
- reject PHI-like freeform import content before row creation
- sanitize PHI-like review comments before review persistence
- Minimum PHI reject categories in code: diagnosis, treatment notes, insurance details, procedure codes, medical record numbers, medication details, and clinical notes.
- Conservative attribution is last-touch and fail-closed:
- direct window = 7 days
- assisted window = 30 days
- all provided evidence hints must resolve to the same campaign message or the revenue event remains unattributed
- one revenue event may create at most one attribution record (`last-touch:{revenueEventId}`)
- Deliverability guardrail chain is mandatory and ordered:
- global kill switch -> tenant pause -> suppression block -> throttle -> invariant alert -> stale-claim recovery -> provider/bounce/spam/failure auto-pause
- Active email suppressions must block the send before Postmark delivery; never rely on downstream unsubscribe handling as the primary safeguard.

## Tier-1 Phase 2 Guardrails
- The canonical operator/backend contract lives only under `/v1` in `/Users/thewhitley/Documents/New project/contracts/openapi/blackbolt.v1.yaml`.
- If the current operator app still depends on non-versioned routes, keep them only as temporary backend compatibility paths. Do not add them to the canonical OpenAPI contract.
- Canonical normalized operator-critical tenant routes are:
  - `/v1/tenants`
  - `/v1/tenants/{tenantId}`
  - `/v1/tenants/{tenantId}/metrics`
  - `/v1/tenants/{tenantId}/dashboard/summary`
  - `/v1/tenants/{tenantId}/events`
  - `/v1/tenants/{tenantId}/alerts`
- `/v1/tenants` is a tenant-scoped operator-key surface, not a portfolio-wide listing route.
- `/v1/auth/login` is excluded from Tier-1. Do not build new clients or workflows against it.
- Every contract edit must pass:
  - `npm run contract:coverage`
  - `npm run contract:lint`
  - `npm run swift:generate`
  - `swift build` in `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltAPI`
- Known generator debt:
  - this spec is OpenAPI `3.1.0` but still has many legacy `nullable:` fields
  - generator currently compiles by translating them, but future touched schemas should prefer explicit 3.1 null unions instead of adding more `nullable:` usage
- During contract-hardening phases, Swift operator source remains read-only unless a compile fix is unavoidable. Do not use Phase 2 as a pretext for Swift convergence.

## Tier-1 Phase 3 Guardrails
- Swift operator app business flows must go through generated `BlackBoltAPI` transport, not handwritten request code.
- Keep the layering explicit:
  - generated client = typed transport surface
  - `OperatorAPIService` = small facade/adapters for UI-friendly shapes
  - `OperatorShellStore` = orchestration and screen state only
  - SwiftUI views = rendering and user interaction only
- Do not reintroduce business-flow transport in:
  - `clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Networking/OperatorHTTP.swift`
  - `clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Models/OperatorRuntimeConfig.swift`
  - `clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Models/OperatorShellStore.swift`
  - any SwiftUI view via `URLSession.shared`
- Deprecated compatibility routes remain backend-only shims during migration. Operator app source must not depend on:
  - `/dashboard/summary`
  - `/alerts`
  - `/events`
  - `/tenants`
  - `/tenants/{tenantId}`
  - `/tenants/{tenantId}/metrics`
- If Phase 3 source/build validation passes but `swift test` is blocked by older suite drift, record the blocker explicitly instead of misattributing it to the transport migration.
- Minimal validation-only compile fixes in unrelated Swift support files are acceptable when they are required to restore `swift build`, but they must not expand product scope or move backend logic into Swift.

## Tier-1 Phase 4 Guardrails
- `swift test` for `clients/swift/BlackBoltOperator` must remain a credible certification signal.
- If a Swift test suite no longer reflects the current architecture:
  - fix it if it still validates live behavior
  - rewrite it if the surface still matters but the helper/API assumptions drifted
  - quarantine it only with explicit documentation in `docs/failure-log.md`
- Operator screens must render state honestly:
  - `loading` when no payload is available yet
  - `empty` when the backend returned no usable content
  - `degraded` when stale content is being shown after a failed refresh
  - `failed` when no usable payload exists
- Do not hardcode backend-owned business policy into Swift view copy. Thresholds, trigger logic, and automation defaults must stay backend-owned; Swift may only present API-backed facts or generic operator guidance.
- Keep transport discipline intact while completing workflows:
  - no `OperatorHTTP`
  - no `URLSession.shared` business flows
  - no reintroduction of deprecated non-versioned operator routes in app source

## Operator Onboarding Truth
- Tenant onboarding is complete only after running `npm run tenant:seed -- --name=\"...\" --slug=...`.
- The seed output is source-of-truth for `tenantId` (`x-tenant-id`) and `operatorKey` (`x-operator-key`).
- Do not mark operator workflows usable until per-tenant operator credential is present in DB.

## GBP Replay Recovery
- Keep poll-trigger idempotency stable unless the trigger semantics change.
- If a dead-lettered GBP page-fetch job blocks replay after auth recovery, bump only the page-fetch idempotency version and document the version change in `docs/decision-log.md` and `docs/failure-log.md`.
- Do not reset the queue or widen dedupe scope just to recover a single stale page-fetch cursor.
- The scheduler runs from `ReviewsQueue.onModuleInit` in both API and worker, with a 600000 ms repeat cadence unless `GBP_POLL_INTERVAL_MS` overrides it.
- Shadow scheduler activation is only safe with `POSTMARK_SEND_DISABLED=1` and `REVIEW_ALERT_INBOUND_ENABLED=0`; the proof target is scheduler-triggered `gbp.ingest` jobs only, with send-path tables staying at zero.
- If the live GBP import persists reviews with `rating = null`, `ReviewClassification` will collapse to `needs_review` and there is no safe live-send candidate yet.
- Operator review surfaces stay auth-gated even when the underlying queue is healthy; the audit path should rely on metadata-only DB inspection when no plaintext operator key is available.
- Live GBP replay/backfill must resolve token material through `TokenVault` / `TOKEN_REF_*` env refs, not a stale raw `GBP_ACCESS_TOKEN`; a direct bearer env can lag behind the refreshed Railway token ref.
- Public GBP reply suggestions must use a separate `ReviewOperatorAction` artifact. Do not reuse `DraftMessage`, `ApprovalItem`, or `ReviewQueueItem` for public-review workflows because they imply private outreach or customer targeting.
- The operator command center may surface `ReviewOperatorAction` only as a read-only metadata summary. Do not add customer inference, raw review text, or send/reply execution to that aggregate payload.

## CWV Lane Guardrail
- Desktop CSS deferral lanes must use explicit handle allowlists and pass a disabled-control median gate before promotion.
- Mobile LCP lanes must pass a disabled-control median gate and include marker-scoped rollback proof before promotion.
- CSS preload lanes must verify emitted preload tags on fresh uncached HTML before running Lighthouse gates.
- Lighthouse v12+ parsing guard: use `lcp-breakdown-insight` and `render-blocking-insight` structures (not deprecated audit ids) when computing gate deltas and LCP subpart evidence.
- Home desktop hero-media lanes must treat modeled `largest-contentful-paint` as gate authority; improved observed-LCP alone is not sufficient to keep a lane.
- Desktop home CSS deferral can improve LCP while still failing score via FCP/CLS sensitivity; strict score gate remains authoritative and requires immediate rollback on failure.
- Desktop home lanes must verify 3-run LCP candidate stability; if candidates switch between runs, run diagnostic-first and avoid CSS timing mutation lanes until discovery is stabilized.
- Any single-variable CWV lane must hard-stop as NO-GO if pre-proof LCP candidate does not match the lane hypothesis (no mutation allowed).
- Query-string disabled-controls can force slower cache paths on production; validate control methodology before trusting enabled-vs-disabled deltas.
- Production CWV gates must not compare `/` against `/?...` controls; use canonical URL for both packs and toggle lane state server-side between 3-run blocks.
