# Decision Log

## 2026-02-14 — Contract CI scripts implemented as `.mjs`
- Context: Phase 1 contract checks needed to run in Node CI and local dev without adding TypeScript runtime/bootstrap complexity.
- Decision: implement `validate-openapi`, `check-breaking-api`, and `check-openapi-coverage` as executable `.mjs` scripts.
- Consequence: deterministic execution in CI with plain Node; no `ts-node` runtime dependency for contract gates.

## 2026-02-14 — `openapi-route-manifest.ts` as server route registry
- Context: OpenAPI coverage gate required a single source of truth for implemented operation IDs before feature modules exist.
- Decision: maintain `apps/api/src/openapi-route-manifest.ts` exporting `OPENAPI_OPERATION_IDS` and compare against spec `operationId` values.
- Consequence: spec coverage can be checked immediately; route modules must update manifest when operation IDs are added/removed.

## 2026-02-14 — Swift generator and toolchain baseline
- Context: prevent generator/toolchain drift between local and CI.
- Decision: use Apple Swift OpenAPI Generator path only (`swift package ... generate-code-from-openapi`) and pin CI Swift toolchain to `6.2.3`.
- Consequence: no Java OpenAPI Generator path is supported; CI now enforces minimum Swift compatibility for generated client flow.

## 2026-02-14 — Governance fallback for unavailable skills
- Context: requested governance skills `architect-brain-v2` and `phase-runner` are not installed locally; remote skill install is unavailable in this environment (network resolution failure).
- Decision: copied equivalent enforcement policy into `CLAUDE.md` under `Governance`.
- Consequence: governance behavior remains enforced without blocking Phase 1.1 progress.

## 2026-02-14 — Phase 2 import transport and segmentation semantics
- Context: customer/suppression ingestion needed a single implementation path for Phase 2.
- Decision: use multipart CSV uploads for both import endpoints in v1.
- Consequence: no pre-signed upload token flow in v1; can be added later without breaking current endpoints.

## 2026-02-14 — Missing `last_service_date` segmentation behavior
- Context: segmentation needed deterministic behavior for missing service history.
- Decision: map missing `last_service_date` to segment `365_plus`.
- Consequence: no `unknown` segment enum added in v1; operators can still filter 0_90 / 90_365 / 365_plus.

## 2026-02-14 — Phase 2.1 Node pin hardening
- Context: build/test reproducibility required strict runtime parity.
- Decision: pin Node to `24.13.1` in `.nvmrc`, root `package.json`, API `package.json`, and CI setup-node steps with explicit mismatch failure checks.
- Consequence: workflows now fail fast on Node drift.

## 2026-02-14 — Offline test mode and Spectral decoupling
- Context: unit test execution must not depend on `@stoplight/spectral-cli` availability.
- Decision: remove root dependency on spectral-cli; run spectral via pinned `npx` in `contract:lint`; add `TEST_OFFLINE=1` mode that skips spectral lint while preserving local coverage checks.
- Consequence: `api:test` and contract coverage run without Spectral installation; contract lint remains available when online.

## 2026-02-14 — Tenant mismatch response code
- Context: tenant header/path mismatch needed explicit policy for isolation test gate.
- Decision: return HTTP 403 for cross-tenant route access mismatch.
- Consequence: guard test enforces `tenant header A + path tenant B => 403`.

## 2026-02-14 — Offline test semantics and CI source of truth
- Context: "offline" test instructions were ambiguous without a prior dependency install.
- Decision: document offline mode as network-free only after first successful install/cache warm-up; keep `api-ci` as the required Jest execution lane.
- Consequence: local "offline" expectations are explicit; CI remains authoritative for end-to-end unit test validation.

## 2026-02-14 — Lockfile change guardrail
- Context: dependency drifts must be intentional.
- Decision: `api-ci` fails PRs that modify lockfiles unless PR has `deps-update` label or commit subject includes `[deps-update]`/`deps-update:`.
- Consequence: lockfile churn is gated and auditable.

## 2026-02-14 — Phase 3 GBP token handling strategy
- Context: tenant GBP integration requires auth pointers without storing sensitive secrets in plain data tables.
- Decision: persist `gbp_access_token_ref` on tenant records (reference-only), not raw token material.
- Consequence: token resolution/refresh must happen through external secret management in later phase.

## 2026-02-14 — Phase 3 review ingestion scope lock
- Context: begin GBP ingestion without outbound messaging/classification.
- Decision: Phase 3 includes GBP integration config, queue-driven poll ingestion, idempotent review upsert, and review listing only.
- Consequence: no Postmark sends, no LLM classify, no approval inbox in this phase.

## 2026-02-14 — Phase 3.1 token resolution contract
- Context: GBP ingestion used token refs but lacked a deterministic resolution interface.
- Decision: define `TokenVault` interface with `resolve(ref)` and `rotate(ref, tokenSet)` plus failure codes (`MISSING_REF`, `REFUSED`, `REVOKED`, `EXPIRED`).
- Consequence: GBP client now depends on a stable token contract and can deterministically set `NEEDS_REAUTH` on auth-class failures.

## 2026-02-14 — Phase 3.1 incremental sync and cooldown policy
- Context: repeated full polls risk quota abuse and duplicate processing.
- Decision: add `gbp_sync_states` with page cursor, `last_success_at`, and `cooldown_until`; ingestion uses max pages/time budget per run.
- Consequence: polling is incremental, bounded, and cooldown-aware to prevent enqueue storms.

## 2026-02-14 — Phase 3.1 raw payload policy
- Context: full raw review payload storage conflicts with no-PHI posture.
- Decision: replace `raw_json` with `redacted_json` plus `payload_hash`.
- Consequence: retained observability without storing full unredacted payloads.

## 2026-02-14 — Phase 4 cursor-scoped idempotency
- Context: time-bucket-only idempotency protects trigger storms but can still duplicate paginated fetch retries.
- Decision: split GBP ingest into poll-trigger jobs and page-fetch jobs; page-fetch idempotency key includes cursor hash (`gbp-ingest:{tenant}:{location}:{cursorHash}:v1`).
- Consequence: retries for the same cursor are stable and deduped; trigger jobs remain time-bucket scoped.

## 2026-02-14 — Phase 4 operator trust summary endpoint
- Context: operators need a single endpoint for integration status, cooldown, last success, latest run telemetry, and alert timeline.
- Decision: add `GET /v1/tenants/{tenantId}/integrations/gbp/operator-summary`.
- Consequence: operator UI can diagnose ingest health without querying multiple tables/routes.

## 2026-02-14 — Phase 4.1 Multer typing stabilization
- Context: `npm run api:build` failed on `Express.Multer.File` typing in controllers with current type package set.
- Decision: keep runtime upload path unchanged for now and replace controller upload annotations with a minimal `UploadedBufferFile` shape (`{ buffer: Buffer }`) to unblock build; defer Multer v2 runtime upgrade to dependency hardening backlog (`DEP-001`).
- Consequence: build is green without behavioral change to import endpoints; Multer runtime upgrade remains tracked and explicit.

## 2026-02-14 — Phase 5.0 Postmark webhook verification policy
- Context: webhook ingestion must be trustworthy before any send logic exists.
- Decision: verify `x-postmark-signature` against raw request body using HMAC-SHA256 and `POSTMARK_WEBHOOK_SECRET`; fail closed (403) when signature/header/secret/raw body is missing or invalid.
- Consequence: unsigned/tampered webhook payloads are never accepted into event ledger.

## 2026-02-14 — Phase 5.0 webhook idempotency and reconciliation
- Context: Postmark webhooks can be duplicated and can arrive before local message mapping exists.
- Decision: persist `postmark_webhook_events` idempotently by unique `provider_event_id`; unresolved message mappings enter reconcile flow on queue `postmark.webhook.reconcile`.
- Consequence: duplicate deliveries are deduped, unresolved events are retried with backoff, and repeated reconcile failure emits integration alerts.

## 2026-02-14 — Phase 5.1 send pipeline safety gates
- Context: outbound sending must remain safety-gated with deterministic stop conditions.
- Decision: add `postmark.send` worker with tenant policy checks (`shadowMode`, `pausedUntil`, rate limits), auto-pause on provider 5xx, failure-rate spikes, and bounce/spam threshold breaches.
- Consequence: send execution is blocked by policy before provider calls and can be halted automatically when reliability/deliverability degrades.

## 2026-02-14 — Delivery state isolation from engagement events
- Context: webhook event ordering should not let engagement events (`opened`, `clicked`) corrupt delivery state machine.
- Decision: maintain centralized `DELIVERY_EVENT_TO_STATE` + `DELIVERY_STATE_RANK`; only delivery-class events update `campaign_messages.delivery_state`.
- Consequence: delivery status remains monotonic and independent from analytics events.

## 2026-02-14 — Phase 5.2 atomic claim and stale-claim recovery
- Context: queue retries and multi-worker execution can produce duplicate sends unless claim ownership is atomic.
- Decision: worker claims via single `updateMany` transition (`QUEUED` or stale `SENDING`) and sets `claimed_at`, `claimed_by`, `send_attempt += 1`; zero-row updates exit immediately.
- Consequence: only one worker can own a send attempt, and stale claims are reclaimable after timeout.

## 2026-02-14 — Phase 5.2 policy controls and kill switch
- Context: rollout from shadow to live requires deterministic, reversible controls.
- Decision: add tenant policy keys `shadowMode`, `shadowRate`, `maxPerHour`; sampling is deterministic from `hash(send_dedupe_key) % 100`; `POSTMARK_SEND_DISABLED=1` globally forces simulation.
- Consequence: retries remain stable under partial ramp and operators can force safe mode globally without code changes.

## 2026-02-14 — Phase 5.2 pause-state merge safety
- Context: pause/resume writes should not clobber each other under concurrent updates.
- Decision: add `postmark_send_controls` table with `policy_version` optimistic concurrency, `paused_until`, `pause_reason`, `last_error_class`, and resume-checklist acknowledgement fields.
- Consequence: pause updates are non-clobbering and resume requires explicit checklist acknowledgment.

## 2026-02-14 — Phase 5.3 webhook auth correction
- Context: Postmark webhook auth model should not rely on a non-guaranteed signature header.
- Decision: make HTTP Basic Auth (`Authorization` header) the required auth gate; keep `x-postmark-signature` optional for telemetry/logging only.
- Consequence: legitimate Postmark webhooks are not dropped due to missing signature header, while auth remains fail-closed.

## 2026-02-14 — Phase 5.4 webhook retry semantics and replay controls
- Context: webhook retries must remain intentional under auth failures vs transient processing errors.
- Decision: webhook endpoint returns `200` on accepted/duplicate/no-op, `401` for auth/IP/rate-limit rejection, and allows `500` propagation on transient storage/runtime failures.
- Consequence: unauthorized requests are stopped, valid events remain idempotent, and transient failures can be retried by provider behavior.

## 2026-02-14 — Phase 5.4 credential rotation and abuse controls
- Context: Basic Auth webhook protection needs safe rotation and replay-pressure controls.
- Decision: support dual-credential auth window (`POSTMARK_WEBHOOK_BASIC_AUTH` + `_PREVIOUS`), record metric when previous credential is used, enforce optional IP allowlist, and apply per-IP/per-tenant minute rate limits.
- Consequence: auth rotation can be performed without downtime while unauthorized/replay traffic is constrained.

## 2026-02-14 — Phase 5.4 send idempotency hard guard
- Context: stale-claim recovery can resend if worker crashes after provider call.
- Decision: block send execution when `provider_message_id` already exists; claim WHERE clause also requires `provider_message_id IS NULL`.
- Consequence: duplicate sends are blocked even across worker restarts once provider identity is persisted.

## 2026-02-14 — Phase 5.5 send invariant enforced in database
- Context: worker now alerts on `delivery_state='SENT' && provider_message_id IS NULL`, but app-level checks alone are not sufficient.
- Decision: add PostgreSQL CHECK constraint `campaign_messages_sent_requires_provider_message_id` via forward migration.
- Consequence: invalid send state cannot be persisted at rest; invariant breaches surface immediately.

## 2026-02-14 — Phase 5.5 webhook verification order hardening
- Context: pre-auth rate limiting and tenant extraction from untrusted webhook payload can amplify DB load under abuse.
- Decision: enforce verification order `IP allowlist -> Basic Auth -> rate-limit`; pre-persistence limiter uses per-IP key only.
- Consequence: unauthorized traffic is rejected earlier and tenant rate limiting cannot be poisoned by untrusted payload metadata.

## 2026-02-14 — Phase 5.5 operator runbook surfacing
- Context: invariant alerts need a deterministic operator response path.
- Decision: operator summary now exposes unresolved `POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID` as an explicit engineering breach with runbook path.
- Consequence: on-call operators get a clear “stop/reconcile/escalate” workflow without ad-hoc handling.

## 2026-02-14 — Phase 5.5 operator summary SQL guidance
- Context: operators need copy/paste diagnostics without unsafe write operations.
- Decision: include `invariants.sendStateBreach.runbookQuery` only when breach is active; query content is read-only `SELECT`.
- Consequence: incident triage is faster without exposing mutation SQL or secret material in API responses.

## 2026-02-14 — Phase 5.5 invariant payload evolution
- Context: a single `sendStateBreach` object does not scale as additional operational invariants are added.
- Decision: add `invariants.breaches[]` as canonical list and keep `sendStateBreach` as a backward-compatible alias to the highest-severity breach.
- Consequence: API can add new invariant classes without breaking consumers.

## 2026-02-14 — Phase 5.5 stale-threshold single source
- Context: stale-claim windows risk drift when hard-coded across detection logic and runbook SQL text.
- Decision: use shared constant `POSTMARK_STALE_SEND_CLAIM_MINUTES` for both detection query and surfaced runbook SQL.
- Consequence: operators and runtime logic stay aligned on stale threshold semantics.

## 2026-02-14 — Phase 5.5 OpenAPI invariant compatibility
- Context: clients may still consume legacy `sendStateBreach` while adopting canonical `breaches[]`.
- Decision: keep `sendStateBreach` in responses, but mark it deprecated in OpenAPI and require only `breaches`.
- Consequence: schema evolution remains backward compatible while guiding consumers to canonical shape.

## 2026-02-14 — Phase 5.5 invariant contract tripwire
- Context: schema edits can accidentally re-require legacy fields or remove enum guarantees.
- Decision: add `scripts/check-postmark-invariants-contract.mjs` to `contract:ci` to enforce: `breaches` required, `sendStateBreach` deprecated/not-required, and enum-backed invariant codes.
- Consequence: OpenAPI regressions on operator invariant contract fail fast in CI.

## 2026-02-14 — Phase 5.5 runtime/contract invariant code sync
- Context: invariant code lists existed in both OpenAPI and TypeScript and could drift independently.
- Decision: add `postmark-invariants-contract-sync.spec.ts` to assert OpenAPI `PostmarkInvariantBreach.code` enum equals runtime invariant code tuple plus unknown sentinel.
- Consequence: invariant code additions/removals now require synchronized runtime and contract updates.

## 2026-02-14 — Phase 5.5 operator diagnostics gating
- Context: operator summary cost needed visibility without leaking internals broadly.
- Decision: add optional `diagnostics` payload (`durationMs`, `prismaCalls`) behind `POSTMARK_OPS_DIAGNOSTICS=1`.
- Consequence: on-call can inspect endpoint cost when needed, while default production responses remain minimal.

## 2026-02-14 — Migration chain immutability tripwire
- Context: migration immutability policy is high-value but can be bypassed by accidental edits under team churn.
- Decision: add `scripts/check-migration-immutability.mjs` with `prisma/migrations/.chain.sha256`; CI compares PR base/head and fails on modified/deleted/renamed existing `migration.sql` files.
- Consequence: existing migrations become mechanically immutable; only new forward migrations are allowed.

## 2026-02-14 — Stale send claim sweeper guardrail
- Context: `SENDING` rows can stall after crash windows even with claim/idempotency guards.
- Decision: add scheduled sweeper job (`postmark-send-sweeper`) to recover stale `SENDING` rows (`provider_message_id IS NULL`) by re-queueing when safe or failing when paused/max-attempts hit, with integration alerts.
- Consequence: stalled claims self-heal or fail visibly without indefinite operator toil.

## 2026-02-16 — Command-center aggregate API for Operator IA
- Context: Operator dashboard required a single read endpoint to meet the <10 minute daily loop and avoid client-side fan-out latency.
- Decision: add `GET /v1/tenants/:tenantId/operator/command-center` aggregating KPI, health, alerts, and activity feed from existing modules without adding broad CRUD.
- Consequence: dashboard render path is now deterministic and additive, with one canonical contract for alert-priority UX.

## 2026-02-16 — Scoped intervention endpoints with mandatory audit trail
- Context: Operator needed one-tap actions while preserving tight blast radius and auditability.
- Decision: add thin intervention endpoints (`retry-gbp-ingestion`, `resume-postmark`, `ack-alert`) that call existing service capabilities and always emit `audit_logs` records.
- Consequence: operator actions are fast and reversible while retaining strict write-scope control.

## 2026-02-16 — Deterministic reactivation workflow completion on ingest
- Context: previously, newly ingested reviews were persisted but did not execute full reactivation workflow states.
- Decision: extend GBP ingest worker to run deterministic workflow gating for newly inserted reviews (classification, confidence policy, segment selection, constrained draft creation, approval/manual lane split, and send scheduling queue).
- Consequence: 5-star genuine positives now move through automated path by default with risk/manual overrides, aligned to 1.0 policy constraints.
