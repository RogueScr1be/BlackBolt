# Decision Log

## Phase 4 Agent 3: Approval Decision Transitions (2026-02-28)

**Decision**: Implement transactional approval decision handlers (approve/reject) with message-level isolation and atomic state changes.

**Rationale**:
- Operators must be able to make binary approval decisions on per-recipient drafted messages
- Atomicity required: all state changes succeed together or none succeed (no partial approvals)
- Message-level isolation enforces invariant: approving ONE approval releases ONLY that recipient's CampaignMessage, not entire run
- runId linkage is mandatory; null runId fails with 409 Conflict (catastrophic invariant breach)
- Auto-promotion logic: run transitions PAUSED → RUNNING when ALL messages are approved (pausedMessages count = 0)

**Implementation**:
- `approvalsService.approveApprovalItem(tenantId, approvalId, operatorUserId?)` wraps all state changes in Prisma transaction
  - Validates: approval exists, tenant match, status='queued', runId not null
  - Updates: ApprovalItem.status='approved' + approvedAt + approvedByUserId
  - Releases: CampaignMessage WHERE (runId, draftMessageId, status='PAUSED') → status='QUEUED'
  - Promotes: if pausedMessages count = 0 and run.status='PAUSED', set run.status='RUNNING' + startedAt
  - Audits: creates AuditLog with action='APPROVAL_APPROVED' and messagesReleased count
  - Returns: approval_id, status='approved', run_id, draft_message_id, message_released=boolean

- `approvalsService.rejectApprovalItem(tenantId, approvalId, reason?)` wraps all state changes in Prisma transaction
  - Validates: approval exists, tenant match, status='queued'
  - Updates: ApprovalItem.status='rejected' + rejectedAt + rejectedReason
  - Defensive: if runId exists, force unpublished messages back to PAUSED (WHERE status IN ['QUEUED','SENDING'] AND providerMessageId=null)
  - Audits: creates AuditLog with action='APPROVAL_REJECTED' and reason
  - Returns: approval_id, status='rejected', run_id, draft_message_id, reason

- `approvalsController` POST endpoints wire service methods to HTTP:
  - POST /:approvalId/approve → approvalsService.approveApprovalItem(tenantId, approvalId, req.userId)
  - POST /:approvalId/reject → approvalsService.rejectApprovalItem(tenantId, approvalId, body.reason)
  - Guards: OperatorKeyGuard, TenantGuard

**Transaction Semantics**:
- prisma.$transaction(async (tx) => { ... }) wraps all DB operations
- Atomic: all state changes succeed or entire transaction rolls back
- AuditLog only created if all prior steps succeed (audit is last step in transaction)
- No partial approvals: if ANY step fails, approval.status remains 'queued'

**Error Handling**:
- 404 NotFoundException: Approval not found
- 403 ForbiddenException: Approval from different tenant
- 400 BadRequestException: Approval already decided (status != 'queued')
- 409 ConflictException: runId is null; cannot determine target run for message release

**Run Promotion Policy**:
- After approval, check if ALL remaining PAUSED messages (without providerMessageId) are released (count = 0)
- If count = 0 and run.status = 'PAUSED', auto-promote run to RUNNING
- Set startedAt = current time if null, else preserve existing startedAt
- Rationale: allows async approval workflow without operator intervention; run auto-starts when all approvals received

**Testing Invariants**:
- Approving message for draft X does NOT release messages for draft Y in same run
- Rejecting does NOT change run status or promote run
- Run only transitions to RUNNING when ALL messages are QUEUED (pausedMessages = 0)
- Operator context (req.userId) is captured in ApprovalItem.approvedByUserId for audit trail
- Rejection is defensive: cannot break invariant even if message was somehow released before rejection

**Files Created**:
- `/apps/api/src/modules/approvals/approvals.service.ts` (approveApprovalItem, rejectApprovalItem methods)
- `/apps/api/src/modules/approvals/approvals.controller.ts` (POST approve, reject endpoints)
- Module already registered in `/apps/api/src/app.module.ts`

**Verification**:
- TypeScript compiles: `npx tsc --noEmit` ✓
- No ConflictException/BadRequestException import errors
- Prisma.$transaction used correctly
- Transaction rollback is automatic (Prisma handles it)
- Error messages are clear and actionable

---

## Phase 4: Message-Level Approval Release (2026-02-28)

**Decision:** Approvals are per-DraftMessage (per-recipient). Approving ONE ApprovalItem releases ONLY that recipient's CampaignMessage, NOT the entire campaign run.

**Rationale:**
- Operators often draft 5-star reviews and want to selectively send them based on confidence/safety checks
- Message-level control allows rejecting one high-risk draft while approving others in the same run
- Prevents accidental bulk release due to operator error

**Implementation:**
- ApprovalItem.runId points to the CampaignRun, but approving only updates the CampaignMessage with draftMessageId=approvalItem.draftMessageId
- CampaignRun auto-promotes from PAUSED to RUNNING only when ALL CampaignMessages without providerMessageId are QUEUED
- Rejection keeps message PAUSED and does NOT affect run status

**Consequence:**
- Operators must individually approve each drafted recipient message
- Approval workflow is more granular but also more time-consuming for large runs
- Future enhancement (Phase 5+): Consider "approve all" bulk operation for operators

**Related Codes:**
- approvalsService.approveApprovalItem() → updates CampaignMessage where (runId, draftMessageId)
- campaign-runs.service.pauseRun() → defensive: keeps unpublished messages PAUSED

---

## 2026-02-28: ApprovalItem.runId Population (Phase 4 Agent 1)

**Decision**: Populate ApprovalItem.runId at creation time in the reactivation workflow.

**Rationale**: Approval decisions operate at the message level but must know which CampaignRun they belong to for transactional safety. Specifically, when an approval action is taken (approve/reject), the system must be able to release the specific CampaignMessage and its associated CampaignRun state atomically. Populating runId at creation time (rather than at decision time) ensures the linkage is available immediately and remains stable even if the approval is re-encountered or reviewed multiple times.

**Implementation**:
- Modified `reviews.processor.ts` (lines 549-568) in the `runReactivationWorkflow` method
- Added `runId: campaignRun.id` to both the `create` and `update` blocks of the ApprovalItem upsert
- This ensures idempotence: if an approval is re-encountered, the runId remains consistent
- No workflow state changes; status remains 'queued' in both blocks
- No new audit actions added; leverages existing 'REACTIVATION_WORKFLOW_ADVANCED' entry

**Verification**:
- TypeScript compilation succeeds (no import changes needed; campaignRun.id is in scope)
- ApprovalItem.runId field exists in schema (prisma/schema.prisma line 385)
- Change is minimal (2 lines added to upsert block)
- No workflow behavior changes; only enriches the ApprovalItem record with run context

**Deployment Impact**: None initially; enables Phase 4 approval decision logic to depend on runId availability.

---

## 2026-02-28: Portfolio Auth Guard Design (Phase 2 Agent A)

**Decision**: Create separate PortfolioKeyGuard (not extending OperatorKeyGuard).

**Rationale**:
- OperatorKeyGuard requires tenantId in request context before key verification (tenant-scoped).
- PortfolioKeyGuard has no single tenant scope; it loads multiple allowedTenantIds from PortfolioTenant join table.
- Reusing OperatorKeyGuard would require refactoring its tenantId dependency, risking breakage to existing operator-key-scoped routes.

**Implementation**:
- PortfolioKeyGuard: reads x-portfolio-key, verifies against PortfolioCredential.keyHash (scrypt), loads allowedTenantIds, attaches req.portfolio.
- Error handling: 401 UnauthorizedException for missing/invalid key, 403 ForbiddenException for zero tenant access.
- Hash verification reuses same scrypt logic as OperatorCredentialsService (copyable function in guard, no shared export).
- Controllers using portfolio guard must validate :tenantId param against allowedTenantIds if route has tenant context.

**Testing**: Unit tests in `/Users/thewhitley/Documents/New project/apps/api/test/portfolio-key.guard.spec.ts` cover:
- Missing header -> 401
- Invalid key -> 401
- Valid key + zero tenants -> 403
- Valid key + multiple tenants -> attaches portfolio context
- Array-safe header handling (Express header arrays)
- Concurrent requests with different keys (independent context per request)

**Verification**:
- All 7 test cases pass
- TypeScript build succeeds (`npm run api:build`)
- Existing OperatorKeyGuard routes remain unaffected
- RequestWithContext type already extended with portfolio property

**Deployment Impact**: None (guard not yet wired to any controller routes; wiring is Agent B/C scope)

## 2026-02-28: Portfolio Tenants OpenAPI Definition (Phase 2 Agent C)

**Decision**: Add `getPortfolioTenants` operation to OpenAPI contract with portfolio-scoped schemas.

**Path**: `/v1/operator/portfolio/tenants` (GET)
**OperationId**: `getPortfolioTenants`
**Security**: bearer auth (x-portfolio-key via PortfolioKeyGuard, defined in YAML)

**Schemas Added**:
- `PortfolioTenantSummary`: { id, name, reviewCount, pendingApprovals, lastActivity }
- `PortfolioTenantSummaryList`: { tenants: [PortfolioTenantSummary[]] }

**Rationale**: New portfolio-scoped endpoint allows operators to view all accessible tenants with key metrics in a single request (no per-tenant header required). Enables portfolio-level dashboards and bulk operations.

**Validation**:
- contract:lint: 0 new errors (121 pre-existing warnings acceptable)
- contract:coverage: 0 mismatch errors (getPortfolioTenants in both YAML and manifest)

**Impact**:
- Swift client auto-regenerates new `getPortfolioTenants()` function
- Postman collection updated automatically on next CI run
- OperationId follows naming convention (camelCase matching API response object pattern)

## 2026-02-27 — CWV phase17 home-desktop diagnostic-first lane selection
- Context: phase16 mini-gate failed on non-target `home-desktop` (`lcp_ms +339.670ms`) during a booking-scoped mutation lane, requiring rollback with unclear direct causality.
- Decision: execute `phase17-home-desktop-lcp-regression-trace-pack` as diagnostic-only (no mutation) and defer further mutation until LCP identity + subpart evidence is captured for `home-desktop`.
- Consequence: next active mutation lane shifts to a home-desktop video-LCP chain hardening lane with strict route/device scoping and unchanged strict thresholds.

## 2026-02-23 — Multi-initiative project boundary hard split
- Context: four active initiatives were being handled in overlapping workspace/thread contexts, causing cross-scope confusion and risk of edits landing in the wrong project.
- Decision: enforce four dedicated project roots (`/Users/thewhitley/Documents/Projects/*`), a registry contract (`docs/project-routing/project-registry.json`), mandatory thread intake mapping (`docs/project-routing/thread-intake.active.json`), and path guard checks (`scripts/project-routing/check-routing.mjs`).
- Consequence: work must declare `active_project_id` before implementation and out-of-scope edits fail unless temporary override reason + expiry are explicitly provided.

## 2026-02-23 — Cross-project override audit and shared-governance allowlist
- Context: routing override approvals needed auditable logging, and thread-safe routing work (`docs/project-routing`, `scripts/project-routing`, governance logs) was blocked by narrow per-project path lists.
- Decision: add JSONL audit logging for approved override crossings and include shared governance paths (`docs/project-routing`, `scripts/project-routing`, `CLAUDE.md`, `docs/decision-log.md`, `docs/learning-log.md`) in every project's `allowed_paths`.
- Consequence: approved exceptions are traceable and routing/governance maintenance remains executable without broadening business-code scope.

## 2026-02-23 — Legacy root deprecation marker contract
- Context: two legacy roots remained runnable and could still capture new work despite canonical root split.
- Decision: require per-root deprecation markers (`DEPRECATED-ROOT.md` and `.deprecated-root.json`) and make `scope-preflight.sh` fail fast with canonical `cd` redirect guidance when cwd is inside a deprecated root.
- Consequence: operators receive deterministic redirect instructions and cannot silently continue execution in tombstoned roots.

## 2026-02-23 — Railway live-check classing with sandbox-aware validation
- Context: live routing checks showed `backboard.railway.com` DNS failures across all initiatives, but host-level commands succeeded outside sandbox.
- Decision: keep `routing:dry-run` strict while adding bounded retries and deterministic failure classes (`INFRA_BLOCKER`, `CONFIG_ERROR`) and require outside-sandbox confirmation before declaring Railway outage.
- Consequence: live failures remain blocking and actionable, with reduced false incident escalation from sandbox network restrictions.

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

## 2026-02-18 — SOS Lactation WordPress SEO operating system baseline
- Context: SOS Lactation SEO execution needed repeatable guardrails and a canonical runbook to prevent plugin overlap, index leakage, and undocumented operational drift.
- Decision: add `SOS Lactation SEO Playbook` section to `/Users/thewhitley/Documents/New project/CLAUDE.md` and adopt `/Users/thewhitley/Documents/New project/docs/runbooks/soslactation-wordpress-seo.md` as canonical execution spec; standardize on Rank Math for SEO control and single performance stack policy (LiteSpeed Cache preferred, WP Rocket fallback).
- Consequence: future SEO runs have deterministic phase gates, rollback discipline, and consistent reporting across staging and production.

## 2026-02-18 — SOS Lactation baseline and monthly reporting artifacts
- Context: Phase-gated SEO execution required standardized baseline capture and monthly reporting outputs inside the repository.
- Decision: add `/Users/thewhitley/Documents/New project/docs/soslactation-seo-baseline.md`, `/Users/thewhitley/Documents/New project/docs/reports/soslactation-seo-report-template.md`, and initial monthly report file `/Users/thewhitley/Documents/New project/docs/reports/soslactation-seo-monthly-2026-02.md`.
- Consequence: every SEO cycle now has a fixed artifact contract for measurement, regression tracking, and operational handoff.

## 2026-02-18 — Phase 0 execution deviation: live WP snapshot completed, host/google gates blocked
- Context: execution attempted for Phase 0 with provided WP credentials and stated HostGator/GSC/GA4 access grants.
- Decision: proceed with non-mutating WP baseline capture (admin access validation, active stack snapshot, sitemap/robots/readings state, Lighthouse metrics), but mark Phase 0 gate `FAIL` because HostGator interactive backup/staging session and Google interactive session credentials were not available in terminal; also record PSI API quota block (`HTTP 429`) and use Lighthouse fallback for measurable baseline.
- Consequence: technical baseline is partially complete and documented, but Phase 1 cannot start until backup+staging+GSC/GA4 gates are completed.

## 2026-02-18 — Phase 0 supplemental finding: Site Kit confirms module linkage
- Context: direct Google console exports remained blocked, but WP admin session allowed inspection of Site Kit bootstrap payload.
- Decision: record Search Console and GA4 connectivity, property/account identifiers, and note that dashboard payload currently reports `data_available=false` for both modules at capture time.
- Consequence: ownership/linkage is verified from within WordPress, but baseline query/page/CWV exports still require direct Google console session or alternate API-keyed pull.

## 2026-02-18 — SOS Phase 2 Stripe->Drive orchestration slice
- Context: SOS automation required a runnable product slice beyond documentation, with deterministic case creation and artifact persistence after payment success.
- Decision: implement tenant-scoped SOS case storage (`sos_cases`, `sos_case_payloads`, `sos_artifacts`, `sos_stripe_webhook_events`), add `POST /v1/webhooks/stripe` for `payment_intent.succeeded`, and enqueue worker processing on `sos.case.orchestration` with idempotency key `sos-case:create:{tenantId}:{paymentIntentId}`.
- Decision: process Drive folder creation in worker via Google service account credentials (`GOOGLE_SERVICE_ACCOUNT_JSON`) under configured root (`SOS_DRIVE_ROOT_FOLDER_ID`), and persist folder artifact metadata as canonical output.
- Consequence: first SOS runnable slice is now deterministic and auditable (`stripe webhook` -> `case row` -> `drive folder artifact`) with dedupe semantics across webhook, queue job id, and job-run ledger.

## 2026-02-18 — SOS Phase 3 intake payment-intent contract
- Context: client-side SOS booking flow needs a deterministic API surface to create Stripe PaymentIntents carrying canonical metadata required by webhook orchestration.
- Decision: add unauthenticated `POST /v1/sos/intake/payment-intents` to create Stripe PaymentIntents with required SOS metadata keys (`sos_tenant_id`, consult type, parent/baby identity fields), validate tenant existence up front, and enforce server-side idempotency key generation when caller does not provide one.
- Decision: call Stripe REST API directly from API service using `STRIPE_SECRET_KEY` and return only minimal client-safe payment intent details (`id`, `client_secret`, `status`, `amount`, `currency`, `idempotencyKey`).
- Consequence: Phase 3 now has a runnable intake->payment trigger surface that feeds the existing Phase 2 webhook pipeline; live execution remains blocked only by missing runtime Stripe credentials.

## 2026-02-18 — SOS Phase 4 operator case list/detail API slice
- Context: Leah console requires a single SOS case list and case-detail surface before action buttons can be wired reliably.
- Decision: add `GET /v1/sos/cases` and `GET /v1/sos/cases/{caseId}` with tenant-scoped lookup, canonical identity extraction from latest case payload version, and deterministic action availability flags.
- Consequence: operator UI can render “New Paid Cases” and case detail from one API surface with no direct Drive browsing dependency.

## 2026-02-18 — SOS Phase 5 SOAP + pedi artifact persistence slice
- Context: consultation workflow needed executable backend actions for SOAP capture and pedi generation before renderer/fax integrations are finished.
- Decision: add `POST /v1/sos/cases/{caseId}/soap` to persist structured SOAP into a new canonical payload version and upsert `soap_note_pdf` artifact metadata; add `POST /v1/sos/cases/{caseId}/pedi-intake/generate` to upsert `pedi_intake_pdf` artifact metadata from latest canonical payload.
- Consequence: Leah-console actions can run end-to-end at data/orchestration level now; actual PDF renderer output is explicitly marked `pending_pdf_renderer` and remains a later integration step.

## 2026-02-18 — SOS Phase 6/7 action + sweep service baseline
- Context: post-consult communication and 30-60 day follow-up loops required executable service actions before external email/fax providers and cron infra are finalized.
- Decision: add case-level actions `POST /v1/sos/cases/{caseId}/follow-up/send` and `POST /v1/sos/cases/{caseId}/provider-fax/send` that upsert artifacts and audit rows in simulated mode; add `POST /v1/sos/scheduler/followups/run` to queue review/referral artifacts for due cases within configurable day windows.
- Consequence: workflow actions are runnable and auditable now; provider transport integration and autonomous scheduling remain explicit follow-on hardening steps.

## 2026-02-18 — SOS Phase 6/7 production transport + automatic sweep
- Context: SOS follow-up and provider-fax actions needed to move from simulated metadata to real transport, and 30-60 day sweep needed autonomous daily execution.
- Decision: wire SOS follow-up email to dedicated Postmark adapter (`SOS_POSTMARK_SERVER_TOKEN`, `SOS_POSTMARK_FROM_EMAIL`), wire provider fax to SRFax adapter (`SOS_FAX_PROVIDER=srfax` + SRFax credentials), and persist provider IDs/status into `sos_artifacts.metadata_json`.
- Decision: add Bull queue `sos.followup.sweep` with repeat scheduler job and worker processor; processor invokes `runFollowupSweep`, writes job-run ledger state, and raises integration alerts on terminal failures.
- Consequence: Phase 6 sends and Phase 7 sweep are now executable production paths with idempotent queue orchestration and explicit failure signaling.

## 2026-02-19 — SOS Phase 0 backup baseline executed via SSH
- Context: HostGator panel automation was blocked by challenge/session friction; SSH key access became available for direct server operations.
- Decision: execute Phase 0 backup and technical snapshot through SSH (`soslaion@192.254.232.183`) and store host-managed backup references in repo docs.
- Consequence: rollback artifacts are now concrete and verifiable without requiring cPanel UI automation.

## 2026-02-19 — SOS Phase 0 Google API baseline blocked by disabled services
- Context: service account authentication succeeded, but API queries to Search Console and GA4 Data returned `403 SERVICE_DISABLED`.
- Decision: mark Google baseline as partial until `searchconsole.googleapis.com` and `analyticsdata.googleapis.com` are enabled in GCP project `617276434551`.
- Consequence: Phase 0 remains `FAIL` until Google APIs are enabled and staging clone gate is completed.

## 2026-02-19 — SOS Phase 1 control-plane migration to Rank Math
- Context: production stack had Clearfy-based SEO/perf overlap and index leakage surfaces (`test`, event/popup post types) exposed in sitemap/indexable pages.
- Decision: install/activate `seo-by-rank-math`, deactivate `clearfy`, and enforce deterministic sitemap pruning/noindex policy via MU plugin (`sos-seo-phase1.php`) on staging and production.
- Consequence: single active SEO plugin is now Rank Math, leakage URLs were reduced, and sitemap index is constrained to quality post types.

## 2026-02-19 — SOS Phase 1 deterministic sitemap pruning via WP core
- Context: Rank Math endpoint `/sitemap_index.xml` did not become available in this host stack after activation, while core sitemap had to remain functional.
- Decision: use WP core sitemap endpoint as canonical in this phase and enforce pruning with filters: remove `jet-popup`, `mp-event`, `mp-column`, and `mp-event_category`; exclude known noindex/system page IDs from page sitemap.
- Consequence: sitemap integrity gate can pass with core endpoint while Rank Math remains active for control-plane migration.

## 2026-02-19 — SOS Phase 1 leakage hard-stop for test pages
- Context: metadata-based noindex was not consistently emitted by the current theme/plugin stack for all target pages.
- Decision: move explicit test pages (`test`, `*-test`) to `draft` status as a deterministic deindex method.
- Consequence: those URLs now resolve as non-indexable 404 surfaces and are absent from sitemap exposure.

## 2026-02-19 — SOS Phase 1 transient .htaccess regression and rollback
- Context: an `.htaccess` X-Robots noindex block was introduced to force header-level noindex for system paths.
- Decision: rollback the block immediately after detecting production sitemap endpoint `403` regression.
- Consequence: sitemap availability restored (`200`), and control was kept in MU plugin + content status changes.

## 2026-02-19 — SOS Phase 0 recheck status after API enablement
- Context: Google APIs were enabled at project level; service account baseline pull was retried.
- Decision: mark GA4 baseline as unblocked (`200`), but keep Phase 0 blocked for GSC because service account still lacks property permission (`403 forbidden`).
- Consequence: Phase 0 remains partial until GSC property access is granted to service account principal.

## 2026-02-19 — SOS Phase 0 final closure after GSC permission fix
- Context: prior Phase 0 blocker was GSC service-account permission denial.
- Decision: rerun GSC+GA4 API pulls after property ownership update; accept URL-prefix property (`https://soslactation.com/`) as canonical for this workflow.
- Consequence: Phase 0 gate is now complete and marked PASS.

## 2026-02-19 — Focused deterministic noindex hardening for commerce/system pages
- Context: commerce/system URLs (`checkout`, `cart`, `shop`, `wpbc-booking`, `wpbc-booking-received`) remained inconsistently indexable via page-level metadata alone.
- Decision: extend MU policy with slug-scoped `wp_robots` enforcement and `send_headers` `X-Robots-Tag: noindex,follow`, and exclude scoped page IDs from sitemap query args.
- Consequence: noindex behavior is deterministic at runtime and scoped URLs are removed from sitemap exposure before Phase 2 CWV work.

## 2026-02-19 — Phase 2 staging performance stack activation (LiteSpeed-first)
- Context: Phase 2 required a single performance stack with conservative JS risk profile and rollback safety.
- Decision: activate `litespeed-cache` on staging, deactivate overlapping `wp-cloudflare-page-cache`, keep Rank Math active, and apply conservative toggles (cache/browser cache, CSS minify, JS minify+defer+delay include list, HTML minify, lazy media, WebP).
- Consequence: staging now has a deterministic single performance stack and documented rollback artifacts for config and content state.

## 2026-02-19 — PSI quota fallback to Lighthouse for Phase 2 evidence
- Context: PageSpeed Insights API returned `429 quota exceeded` during the execution window.
- Decision: use Lighthouse CLI mobile+desktop on the same locked 4-URL staging set as authoritative before/after evidence for this run and log PSI as blocked.
- Consequence: Phase 2 staging metrics remain comparable and auditable despite temporary PSI quota exhaustion.

## 2026-02-19 — Hold production Phase 2 cutover after mixed LCP movement
- Context: staging Lighthouse performance scores improved across all locked URLs, but mobile LCP regressed on homepage and booking templates.
- Decision: mark `Phase 2 Staging: PASS` and `Production Phase 2 Ready: FAIL` pending an additional LCP-focused stabilization cycle.
- Consequence: no production Phase 2 mutation is shipped in this run; risk is contained to staging.

## 2026-02-19 — Phase 2.1 LCP stabilization attempt did not clear gate
- Context: Phase 2.1 targeted homepage/booking LCP recovery on staging with no production changes.
- Decision: test LiteSpeed render-path variants (`guest=1`, `guest_optm=1`, and media lazy-load variants) with full Lighthouse remeasurement on locked URLs.
- Consequence: homepage LCP improved in one candidate run, but booking LCP and mobile score guardrail did not pass versus prior Phase 2 baseline, so the gate remained failed.

## 2026-02-19 — Phase 2.1 rollback to prior stable Phase 2 tuning
- Context: stabilization variants did not satisfy gate criteria and increased risk of inconsistent mobile outcomes.
- Decision: revert Phase 2.1 delta settings on staging (`guest=0`, `guest_optm=0`, `media-lazy=1`) and keep existing conservative Phase 2 stack as active state.
- Consequence: staging returns to prior known-good Phase 2 profile; production remains on hold and Phase 3 start is blocked.

## 2026-02-20 — Phase 2.2 home/booking template remediation attempt
- Context: follow-up required a narrower template-level pass focused on home and booking LCP candidates.
- Decision: apply Elementor node-level edits on pages `254` and `2507` (hero section no-lazy class + image size targeting) and add a narrow staging MU rule to prioritize target LCP attachment IDs while removing non-target high-priority image hints.
- Consequence: home LCP improved modestly, but booking LCP and mobile score regressed against prior Phase 2 baseline, so mini-gate failed and full 4-URL batch did not run.

## 2026-02-20 — Phase 2.2 rollback and hold
- Context: mini-gate failure required immediate reversion per rollback policy.
- Decision: revert Elementor node changes on `254` and `2507`, remove temporary MU plugin `sos-cwv-phase22.php`, flush cache, and revalidate noindex/canonical safety.
- Consequence: staging returned to prior stable Phase 2 state; `Production Phase 2 Ready` remains `FAIL` and `Phase 3 Start Ready` remains `FAIL`.

## 2026-02-20 — Phase 2.2b redesign pass (content-first booking, background-first home)
- Context: a second booking-focused pass was requested with deeper composition changes rather than only priority toggles.
- Decision: attempt Elementor structural updates (booking secondary section reordered later, home hero/logo priority reshaping) plus a temporary narrow MU rule for page-specific media priority normalization.
- Consequence: mini-gate still failed against prior Phase 2 baseline (home and booking LCP did not improve; booking mobile score regressed materially), so full 4-URL batch was blocked.

## 2026-02-20 — Phase 2.2b rollback and production hold maintained
- Context: Phase 2.2b mini-gate fail triggered rollback protocol.
- Decision: restore `254` and `2507` Elementor JSON from phase2-2b snapshot, remove temporary MU plugin `sos-cwv-phase22b.php`, flush cache, and re-run noindex/canonical/sitemap safety checks.
- Consequence: staging returned to prior stable state with safety controls intact; `Production Phase 2 Ready` and `Phase 3 Start Ready` remain `FAIL`.

## 2026-02-20 — Phase 2.2c booking hero text/CTA-first attempt
- Context: next action required a booking-only remediation pass to remove above-the-fold decorative media while leaving home unchanged.
- Decision: run a narrow staging mutation on page `2507` (clear icon/media widgets `71a9a610`, `5e1dcc7e`, `41305cbb`, `5005ea4`, `84fb074`, remove widget `57bdf674`) with mini-gate-only remeasurement.
- Consequence: mobile mini-gate failed hard against locked baseline (`home LCP +13372.26`, `booking LCP +11137.03`, booking score `32` below guardrail), so full 4-URL batch was blocked.

## 2026-02-20 — Phase 2.2c rollback and hold retained
- Context: Phase 2.2c mini-gate failure required immediate rollback per gate policy.
- Decision: restore staging DB from `/home1/soslaion/backups/phase2-2c-stg-20260220T153044Z/soslaion_wp68837_20260220T153044Z.sql`, flush Elementor CSS cache, flush WordPress cache, and rerun noindex/canonical/sitemap safety checks.
- Consequence: staging returned to safe prior state; `Phase 2.2c Mini-Gate` is `FAIL`, and both `Production Phase 2 Ready` and `Phase 3 Start Ready` remain `FAIL`.

## 2026-02-20 — Phase 2.2d CSS-only booking icon suppression attempt
- Context: next controlled pass required zero template/data mutation and focused only on booking hero/card decorative media.
- Decision: deploy temporary staging MU plugin `sos-cwv-phase22d.php` that applies booking-page CSS suppression (`.elementor-element-411cc003 .elementor-image-box-img` and `.elementor-element-57bdf674`) and rerun mini-gate on home + booking only.
- Consequence: home improved vs locked baseline, but booking still failed gate (`score -7`, `LCP +6869.72`), so mini-gate remained failed and full 4-URL batch stayed blocked.

## 2026-02-20 — Phase 2.2d rollback completed; HTTP revalidation blocked by timeout window
- Context: mini-gate failure triggered immediate rollback.
- Decision: remove temporary MU plugin `sos-cwv-phase22d.php`, flush Elementor CSS cache and WordPress cache, and confirm rollback state via SSH (`blog_public=0`, Rank Math active, Clearfy inactive).
- Consequence: staging mutation was fully reverted and hold remains (`Production Phase 2 Ready: FAIL`, `Phase 3 Start Ready: FAIL`); external HTTP safety matrix checks were attempted but timed out during this run window and must be re-run when staging responsiveness normalizes.

## 2026-02-20 — Staging decommission of legacy Booking plugin
- Context: booking plugin was confirmed legacy and not required for active WPForms/Stripe consultation flows.
- Decision: decommission in safe mode on staging by adding MU redirects from `/wpbc-booking/` and `/wpbc-booking-received/` to `/book-a-consultation/`, then deactivate plugin `booking` while preserving booking tables for rollback.
- Consequence: legacy booking endpoints now 301 to consultation page, booking plugin is inactive, and rollback remains low-risk because data tables were retained.

## 2026-02-20 — WPForms entries issue diagnosed as visibility/update-path, not data loss
- Context: operator report indicated entries looked wiped or invisible in dashboard despite emails still sending.
- Decision: verify entries table integrity and latest rows by form ID, audit form settings for `disable_entries`, harden administrator WPForms entry capabilities, clear transients/cache, and run plugin update refresh.
- Consequence: entries are confirmed intact and write-path functional (new staging test row inserted as `entry_id=1905`), but update-path remains blocked because WPForms license is missing; dashboard UI visibility needs authenticated browser-side confirmation after capability fixes.

## 2026-02-20 — Broad legacy plugin decommission wave approved and executed
- Context: after inventory and dependency probes, legacy booking stack and low-value legacy plugins were selected for removal.
- Decision: decommission `booking`, `clearfy`, `i-recommend-this`, and `mailchimp-for-wp` with staging-first gate, production rollout only after staging pass, and booking-table quarantine.
- Consequence: both staging and production now run without those four plugins, with deterministic redirects for legacy booking URLs and no observed smoke-test regressions on core pages/forms.

## 2026-02-20 — WPForms license location check result
- Context: update path for WPForms remained blocked and license source was unknown.
- Decision: perform masked option/config checks for license storage.
- Consequence: no active license key found in `wp-config.php` (`WPFORMS_LICENSE_KEY` absent) and `wpforms_settings[license]` is empty on staging and production; WPForms remains operational for current flows but update channel remains unavailable without license or manual package migration.

## 2026-02-21 — Phase 2R gate criteria pass and production promotion
- Context: Phase 2 remained blocked after multiple prior mini-gate failures, requiring a deterministic pass/fail gate before production mutation.
- Decision: run a new staging mini-gate (`pass6`) and full 4-URL validation set, then evaluate against declared criteria (home+booking mobile LCP improvement and no locked mobile score drop >3).
- Consequence: gate passed and CWV patch `sos-cwv-phase2r.php` was promoted to production with backup-first rollback posture.

## 2026-02-21 — Showcase SEO controls moved to deterministic MU layer
- Context: theme/render stack and edge caching produced inconsistent title/meta propagation on money pages when relying on plugin defaults alone.
- Decision: deploy `sos-seo-showcase.php` MU plugin (title map, meta description map, LocalBusiness + Service/FAQ schema) and validate with cache-bypass URL checks.
- Consequence: showcase pages now return deterministic title/meta/schema outputs in fresh renders without requiring additional plugin churn.

## 2026-02-21 — Internal-link graph hardening via targeted template/post mutations
- Context: services -> booking -> authority-cluster link paths required explicit strengthening for showcase URLs.
- Decision: update Elementor fields on pages `254`, `1170`, `2507`, `959` and append CTA/internal-link blocks on authority posts (`2672`, `2606`, `2608`) through WP-CLI scripted mutations.
- Consequence: money pages and authority posts now cross-link with explicit booking/service pathways.

## 2026-02-21 — Local-pack execution standardized with NAP/cadence artifacts
- Context: Phase 4 required repeatable operations beyond one-off edits.
- Decision: normalize on-site NAP language (including contact page wording + LocalBusiness schema) and add runbook/template artifacts for review/citation cadence.
- Consequence: local SEO operations now have a deterministic weekly/monthly execution contract tied to consultation completions.

## 2026-02-21 — WPForms migration source-of-truth export completed
- Context: Step 5 required non-blocking migration readiness without disrupting live form conversion paths.
- Decision: export WPForms form definitions + WPForms tables and add explicit cutover checklist.
- Consequence: migration can proceed with rollback-safe form/entry archives while current WPForms flows remain active.

## 2026-02-21 — Utility noindex caveat accepted with layered controls
- Context: external header/meta noindex on `/checkout/`, `/cart/`, and `/shop/` remains inconsistent due upstream cache behavior.
- Decision: keep layered controls active (MU logic, sitemap exclusion, legacy booking redirect noindex) and carry residual risk explicitly in reporting.
- Consequence: index-surface protection remains in place, with utility noindex header behavior flagged as an open operational caveat.

## 2026-02-21 — Utility noindex gap closed with narrow .htaccess rules
- Context: upstream cache served utility pages without consistent noindex header/meta propagation on `/checkout/`, `/cart/`, and `/shop/`.
- Decision: add path-scoped `X-Robots-Tag: noindex,follow` rules in production/staging `.htaccess` for utility slugs only, with pre-change file backups and post-change sitemap verification.
- Consequence: utility URLs now emit deterministic noindex headers while `/wp-sitemap.xml` remains `200`; legacy booking redirects continue single-hop behavior.

## 2026-02-27 — Phase18 fail-branch decision: retire batch17 from forward mutation and run clean-state home control pack
- Context: `batch17-home-desktop-hero-video-lcp-chain-hardening` failed strict mini-gate despite route-scoped mutation and validator-passed targeting.
- Decision: retire batch17 from forward mutation decisioning (audit retained), keep strict thresholds unchanged, and run `phase19-home-lcp-post-rollback-control-pack` as diagnostic-only before choosing the next mutation lane.
- Consequence: production remains blocked; full-gate skipped for phase18 per policy; next mutation lane selection deferred until post-rollback home control evidence is captured.

## 2026-03-27 — Phase 19 resume proof parity uses shared audited helper with FK-safe actor persistence
- Context: direct Postmark resume had regressed to a minimal runtime payload while intervention resume still used a separate audit write that could fail on `audit_logs_actor_user_id_fkey` when operator callers presented synthetic actor identifiers such as `operator`.
- Decision: restore the shared Phase 15-style `ackAndResume` proof path as the single audit writer for both `/v1/tenants/{tenantId}/integrations/postmark/resume` and `/v1/tenants/{tenantId}/interventions/resume-postmark`, and resolve `actor_user_id` only when the presented actor matches a real tenant-scoped `users.id`.
- Consequence: both resume surfaces now return the same typed proof semantics, successful resumes emit exactly one audit row, synthetic actors persist `actor_user_id = null`, and provenance remains preserved in audit metadata.
