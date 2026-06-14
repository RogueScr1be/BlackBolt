# Failure Log

## 2026-06-14 — Phase C-F3 synthetic smoke audit-log FK failure

### Summary
The synthetic inbound review-alert smoke reached the Postmark adapter, but the transaction failed on `audit_logs_actor_user_id_fkey` because the shadow adapter wrote `actorUserId: 'system'` even though `AuditLog.actorUserId` is nullable and no `User` row with id `system` exists in production.

### Guardrail
- Shadow email-alert adapters must write `actorUserId: null` for system-generated audit rows unless a real persisted actor exists.
- Treat synthetic smoke failures caused by invented actor ids as a release blocker for the adapter transaction, not as a DB/environment issue.

## 2026-03-14 — Phase 0 Tier-1 architecture audit findings

### Summary
Phase 0 confirmed that Black Bolt is fundamentally backend-centered, but Tier-1 is not yet decision-safe to declare complete. The highest-risk findings are contract drift in the Swift operator app, incomplete route-level tenant-safety proof across all `/v1` surfaces, incomplete PHI-prevention proof by mechanism, incomplete attribution proof for no-double-counting, and distributed deliverability guardrails that are not yet captured as one architecture-complete record.

### Current known failures and risks
- Handwritten Swift networking drift:
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Models/OperatorRuntimeConfig.swift`
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Networking/OperatorHTTP.swift`
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Models/OperatorShellStore.swift`
  - Why it matters: violates the thin-client contract and increases API/contract drift risk.
- Non-`/v1` operator route dependencies:
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/dashboard/dashboard.controller.ts`
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/events/events.controller.ts`
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/alerts/alerts.controller.ts`
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-tenants/operator-tenants.controller.ts`
  - Why it matters: the current operator UI depends on non-versioned routes, which weakens contract discipline and generated-client convergence.
- Incomplete PHI-prevention proof:
  - Why it matters: the repo has schema- and policy-level signals, but Phase 0 did not find a single explicit mechanism proof covering every import boundary.
- Incomplete conservative attribution proof:
  - Why it matters: schema constraints exist, but Phase 0 still needs an explicit logic trace proving no double counting across click, send, and booking paths.
- Incomplete route-level tenant-enforcement proof:
  - Why it matters: guards exist, but every operator-facing and tenant-facing `/v1` route must be classified from code, not inferred from naming.
- Duplicate/generated clutter recorded as hygiene risk only:
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltOperator/Sources/BlackBoltOperator 2`
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltAPI/openapi 2.yaml`
  - Why it matters: these create source-of-truth ambiguity and accidental edit risk, but Phase 0 does not clean them up.

## 2026-03-14 — Phase 0 route coverage appendix

### Classification notes
- `safe`: route is under `/v1`, tenant/membership enforcement is explicit in guards and/or controller handoff, and no obvious scope hole was found in the controller contract.
- `partial`: route is under `/v1`, but safety depends on service-level proof not fully audited in Phase 0, or the route sits in an incomplete/not-yet-implemented contract area, or tenant resolution is indirect.
- `unsafe`: route is under `/v1`, but the current controller contract is not sufficient to treat it as production-safe for Tier-1 without backend changes or a deeper service audit.

| Route | Controller file | Applied guards | Tenant resolution mechanism | Membership enforcement mechanism if operator-facing | Current status |
| --- | --- | --- | --- | --- | --- |
| `/v1/bootstrap/status` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/bootstrap/bootstrap.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | `TenantGuard` derives `req.tenantId` from `x-tenant-id` and enforces route/header match | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/tenants/tenants.controller.ts` | `TenantGuard` | `TenantGuard` from `x-tenant-id` | none | unsafe |
| `/v1/tenants/:tenantId/customers/imports` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/customers/customers.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | partial |
| `/v1/imports/:importId` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/customers/customers-imports-status.controller.ts` | `TenantGuard` | `TenantGuard` from `x-tenant-id`; controller passes `req.tenantId` into service lookup | none | partial |
| `/v1/tenants/:tenantId/customers` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/customers/customers.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/customers/segments` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/customers/customers.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/suppressions/imports` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/suppressions/suppressions.controller.ts` | `TenantGuard` | route param plus `TenantGuard` | none | unsafe |
| `/v1/suppressions/imports/:suppressionImportId` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/suppressions/suppressions.controller.ts` | `TenantGuard` | `TenantGuard` from `x-tenant-id`; service lookup uses `req.tenantId` | none | partial |
| `/v1/tenants/:tenantId/integrations/gbp` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/integrations/integrations.controller.ts` | `TenantGuard` | route param plus `TenantGuard` | none | unsafe |
| `/v1/tenants/:tenantId/integrations/gbp/operator-summary` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/integrations/integrations.controller.ts` | `TenantGuard` | route param plus `TenantGuard` | none | partial |
| `/v1/tenants/:tenantId/reviews/poll` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/reviews/reviews.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/reviews` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/reviews/reviews.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/revenue/events` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/revenue/revenue.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard`; controller also checks `req.tenantId === tenantId` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/revenue/imports` `POST` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/revenue/revenue-import.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard`; controller also checks `req.tenantId === tenantId` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/revenue-imports/:revenueImportId` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/revenue/revenue-import.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | `TenantGuard` from `x-tenant-id`; service lookup uses `req.tenantId` | tenant-scoped operator key via `OperatorKeyGuard` | partial |
| `/v1/tenants/:tenantId/revenue/imports` `GET` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/revenue/revenue-import.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard`; controller also checks `req.tenantId === tenantId` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/revenue/summary` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/revenue/revenue.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard`; controller also checks `req.tenantId === tenantId` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/campaign-runs` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/campaign-runs/campaign-runs.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/campaign-runs/:runId` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/campaign-runs/campaign-runs.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | partial |
| `/v1/tenants/:tenantId/campaign-runs/:runId/pause` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/campaign-runs/campaign-runs.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | partial |
| `/v1/tenants/:tenantId/campaign-runs/:runId/resume` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/campaign-runs/campaign-runs.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | partial |
| `/v1/tenants/:tenantId/integrations/postmark/operator-summary` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark-ops.controller.ts` | `TenantGuard` | route param plus `TenantGuard` | none | unsafe |
| `/v1/tenants/:tenantId/integrations/postmark/resume` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark-ops.controller.ts` | `TenantGuard` | route param plus `TenantGuard` | none | unsafe |
| `/v1/tenants/:tenantId/operator/command-center` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator/operator.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/interventions/retry-gbp-ingestion` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator/operator.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/interventions/resume-postmark` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator/operator.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/interventions/ack-alert` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator/operator.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | partial |
| `/v1/tenants/:tenantId/reports/monthly` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator/operator.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | partial |
| `/v1/tenants/:tenantId/reports/monthly/pdf` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/reports/reports.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/reports/monthly/export.csv` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/reports/reports.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/operator/smoke` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator/operator.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/operator/keys/rotate` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator/operator.controller.ts` | `OperatorKeyGuard`, `TenantGuard` | route param plus `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/links/:code` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/links/links.controller.ts` | none | tenant resolved from `link_codes` lookup by code | none | partial |
| `/v1/webhooks/postmark` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark.controller.ts` | none at controller layer; auth handled in service | tenant resolved inside webhook processing from payload/provider mapping | none | partial |
| `/v1/auth/login` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/auth/auth.controller.ts` | none | none | none | unsafe |
| `/v1/operator/portfolio/tenants` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `PortfolioOperatorGuard` | `PortfolioOperatorGuard` sets `req.operatorTenantIds` from portfolio key or tenant key | controller passes `allowedTenantIds` to service | safe |
| `/v1/operator/reviews/queue` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `PortfolioOperatorGuard` | `PortfolioOperatorGuard` sets `req.operatorTenantIds` | controller passes `allowedTenantIds` and optional tenant filter to service | safe |
| `/v1/operator/approvals` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `PortfolioOperatorGuard` | `PortfolioOperatorGuard` sets `req.operatorTenantIds` | controller passes `allowedTenantIds` and optional tenant filter to service | safe |
| `/v1/operator/approvals/:approvalId` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `PortfolioOperatorGuard` | `PortfolioOperatorGuard` sets `req.operatorTenantIds` | controller passes `allowedTenantIds` to service | partial |
| `/v1/operator/approvals/:approvalId/draft` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `PortfolioOperatorGuard` | `PortfolioOperatorGuard` sets `req.operatorTenantIds` | controller passes `allowedTenantIds` to service | partial |
| `/v1/operator/approvals/:approvalId/approve` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `PortfolioOperatorGuard` | `PortfolioOperatorGuard` sets `req.operatorTenantIds` | controller passes `allowedTenantIds` to service | partial |
| `/v1/operator/approvals/:approvalId/reject` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `PortfolioOperatorGuard` | `PortfolioOperatorGuard` sets `req.operatorTenantIds` | controller passes `allowedTenantIds` to service | partial |
| `/v1/operator/reviews/:reviewId/reactivation-runs` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `PortfolioOperatorGuard` | `PortfolioOperatorGuard` sets `req.operatorTenantIds` | controller passes `allowedTenantIds`; body may include `tenant_id` and service must validate it | partial |

### Non-versioned route dependency note
The current operator UI also depends on non-versioned routes implemented in:
- `/Users/thewhitley/Documents/New project/apps/api/src/modules/dashboard/dashboard.controller.ts`
- `/Users/thewhitley/Documents/New project/apps/api/src/modules/events/events.controller.ts`
- `/Users/thewhitley/Documents/New project/apps/api/src/modules/alerts/alerts.controller.ts`
- `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-tenants/operator-tenants.controller.ts`

These are not part of the `/v1` appendix, but they are a Phase 0 contract-discipline gap and must be treated as backend-first Phase 1 work.

## 2026-03-15 — Phase 1 closure report and remaining exceptions

### Tenant-enforcement closure report
| Route | Controller | Service | Guard(s) after fix | Tenant source of truth | Membership enforcement | Status after fix |
| --- | --- | --- | --- | --- | --- | --- |
| `/v1/imports/:importId` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/customers/customers-imports-status.controller.ts` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/customers/customers.service.ts` | `OperatorKeyGuard`, `TenantGuard` | `x-tenant-id` -> `req.tenantId` -> `findFirst({ id, tenantId })` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/suppressions/imports` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/suppressions/suppressions.controller.ts` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/suppressions/suppressions-import.service.ts` | `OperatorKeyGuard`, `TenantGuard` | route `tenantId` + `x-tenant-id` enforced by `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/suppressions/imports/:suppressionImportId` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/suppressions/suppressions.controller.ts` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/suppressions/suppressions-import.service.ts` | `OperatorKeyGuard`, `TenantGuard` | `x-tenant-id` -> `req.tenantId` -> `findFirst({ id, tenantId })` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/integrations/gbp` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/integrations/integrations.controller.ts` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/integrations/integrations.service.ts` | `OperatorKeyGuard`, `TenantGuard` | route `tenantId` + `x-tenant-id` enforced by `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/integrations/gbp/operator-summary` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/integrations/integrations.controller.ts` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/integrations/integrations.service.ts` | `OperatorKeyGuard`, `TenantGuard` | route `tenantId` + `x-tenant-id` enforced by `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/integrations/postmark/operator-summary` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark-ops.controller.ts` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark-ops.service.ts` | `OperatorKeyGuard`, `TenantGuard` | route `tenantId` + `x-tenant-id` enforced by `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants/:tenantId/integrations/postmark/resume` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark-ops.controller.ts` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark-ops.service.ts` | `OperatorKeyGuard`, `TenantGuard` | route `tenantId` + `x-tenant-id` enforced by `TenantGuard` | tenant-scoped operator key via `OperatorKeyGuard` | safe |
| `/v1/tenants` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/tenants/tenants.controller.ts` | n/a (`NotImplementedException`) | `OperatorKeyGuard`, `TenantGuard` | `x-tenant-id` -> `req.tenantId` | tenant-scoped operator key via `OperatorKeyGuard` | partial |
| `/v1/operator/approvals/:approvalId` and mutation endpoints | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.service.ts` | `PortfolioOperatorGuard` | `req.operatorTenantIds` | `allowedTenantIds` enforced by `findScopedApproval` / `assertAllowedTenant` | safe |
| `/v1/operator/reviews/:reviewId/reactivation-runs` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.controller.ts` | `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-portfolio/operator-portfolio.service.ts` | `PortfolioOperatorGuard` | `req.operatorTenantIds` | `allowedTenantIds` + `assertAllowedTenant` on resolved review tenant | safe |

### PHI-enforcement points now active
- `/Users/thewhitley/Documents/New project/apps/api/src/modules/common/csv-import.ts`
  - rejects unsupported customer/suppression columns before persistence
  - rejects PHI-like freeform suppression `reason` values before persistence
  - rejects PHI-like freeform revenue `description` values before persistence
- `/Users/thewhitley/Documents/New project/apps/api/src/modules/common/phi-guard.ts`
  - canonical reject/sanitize patterns for diagnosis, treatment notes, insurance details, procedure codes, medical record numbers, medication details, and clinical notes
- `/Users/thewhitley/Documents/New project/apps/api/src/modules/gbp/gbp.client.ts`
  - sanitizes PHI-like review comments to `null` before persistence and marks redacted metadata

### Attribution closure now active
- Runtime source of truth:
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/revenue/revenue.service.ts`
- Direct window:
  - 7 days
- Assisted window:
  - 30 days
- Dedupe source of truth:
  - one attribution per revenue event via `dedupeKey = last-touch:{revenueEventId}`
- Fail-closed rules:
  - conflicting hint sources resolve to no attribution
  - stale clicks/sends outside the attribution windows resolve to no attribution
  - retries with later conflicting hints preserve the first attribution instead of creating another

### Deliverability chain now active
- Runtime source of truth:
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark-send.processor.ts`
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark-policy.service.ts`
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/postmark/postmark.service.ts`
- Guardrail order:
  1. global kill switch -> simulate
  2. tenant pause -> block
  3. active suppression -> block before provider send
  4. rate limits -> auto-pause
  5. invariant alert on impossible send state
  6. stale-claim sweeper -> requeue/fail with alerts
  7. provider/bounce/spam/failure thresholds -> auto-pause

### Remaining open items after Phase 1
- Non-versioned operator routes remain a contract-discipline gap:
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/dashboard/dashboard.controller.ts`
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/events/events.controller.ts`
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/alerts/alerts.controller.ts`
  - `/Users/thewhitley/Documents/New project/apps/api/src/modules/operator-tenants/operator-tenants.controller.ts`
- `/v1/auth/login` remains `unsafe` by design in the appendix because it is a placeholder and still throws `NotImplementedException`.
- `/v1/tenants` remains `partial` rather than `safe` because the endpoint is intentionally unimplemented even though the guard chain now fails closed.
- Public ingress surfaces remain intentionally non-guarded and must stay service-authenticated instead of tenant-key authenticated:
  - `/v1/links/:code`
  - `/v1/webhooks/postmark`

## 2026-03-15 — Phase 2 compatibility debt and future Phase 3 blockers

### Legacy route compatibility still active
- Current operator consumers still use these non-versioned compatibility routes:
  - `/dashboard/summary`
  - `/alerts`
  - `/events`
  - `/tenants`
  - `/tenants/{tenantId}`
  - `/tenants/{tenantId}/metrics`
- Current non-Swift smoke tooling also uses the same legacy paths in the rollout verification scripts.
- Disposition:
  - canonical replacements now exist under `/v1`
  - legacy routes stay alive temporarily for compatibility
  - legacy routes are removed from `/Users/thewhitley/Documents/New project/contracts/openapi/blackbolt.v1.yaml`
  - Phase 3 must migrate Swift and smoke tooling off the legacy paths before removal

### `/v1/auth/login` final disposition
- `/v1/auth/login` is no longer part of the canonical Tier-1 contract.
- Runtime keeps a `410 Gone` response so accidental callers fail explicitly instead of seeing a fake placeholder.
- Future work must not reintroduce interactive login into the operator contract without an explicit approved auth design.

### Generated-client validation findings
- `npm run swift:generate` completed successfully against the hardened spec and wrote generated sources into:
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltAPI/Sources/BlackBoltAPI`
- `swift build` completed successfully for `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltAPI`.
- Known warning debt remains:
  - the OpenAPI document is declared as `3.1.0` but still uses many `nullable:` schema properties
  - Apple Swift OpenAPI Generator compiles through this by translating them, but it emits repeated validation warnings
- Phase 3 blocker status:
  - not a hard blocker for convergence
  - but any future touched schemas should migrate from `nullable:` to explicit 3.1 null unions to reduce generator noise and future ambiguity

### Phase 3 adapter note
- The generated client now exposes the normalized operations the operator app will need:
  - `listOperatorTenants`
  - `getOperatorTenant`
  - `getOperatorTenantMetrics`
  - `getDashboardSummary`
  - `listOperatorEvents`
  - `listOperatorAlerts`
- The remaining convergence work is not backend contract work; it is an adapter/state rewrite in Swift so `OperatorShellStore` stops hardcoding path strings and instead maps generated operation inputs/outputs into existing section state.

## 2026-03-15 — Phase 3 operator thin-client convergence validation

### What failed before completion
- The operator app still owned handwritten transport and route plumbing in Swift:
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Networking/OperatorHTTP.swift`
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Models/OperatorRuntimeConfig.swift`
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltOperator/Sources/BlackBoltOperator/Models/OperatorShellStore.swift`
- That drift made the app depend on deprecated non-versioned operator paths and duplicated transport concerns already owned by generated `BlackBoltAPI`.

### What changed
- Tier-1 business flows now go through generated-client-backed `OperatorAPIService` plus thin mapping adapters.
- Deprecated non-versioned operator route strings were removed from operator app source in favor of canonical `/v1` paths.
- Direct business-flow transport usage (`OperatorHTTP`, `runtime.request(...)`, `URLSession.shared`) no longer appears in operator app source.

### Validation result
- `swift build` now passes for:
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltOperator`
  - `/Users/thewhitley/Documents/New project/clients/swift/BlackBoltAPI`
- Full `swift test` for `BlackBoltOperator` still fails before Phase 3 tests run, but the failures are pre-existing test-harness drift unrelated to the transport convergence:
  - security tests target outdated `APIRequestValidator`, `AppSandboxManager`, and `CertificatePinning` APIs
  - shared test helpers are not updated for the current `@MainActor` isolation on `OperatorRuntimeConfig`
  - several helper utilities rely on unavailable `Task.gather` / old XCTest invocation patterns

### Guardrail learned
- When a Phase 3 transport migration is complete but package-wide tests are blocked by older suite drift, record the blocker explicitly and separate:
  - source/build proof for the migrated paths
  - pre-existing suite failures that must be repaired in a dedicated test-infrastructure pass

## 2026-03-17 — Phase 4 Swift certification blockers and remaining quarantine

### Failures encountered during certification repair
- `Tests/BlackBoltOperatorTests/Models/OperatorRuntimeConfigTests.swift`
  - Failure: XCTest lifecycle overrides were annotated for the main actor, which Swift 6 rejects because `setUpWithError` / `tearDownWithError` stay nonisolated.
  - Fix: move `OperatorRuntimeConfig` usage into `@MainActor` test methods instead of forcing actor isolation onto XCTest hooks.
- `Tests/BlackBoltOperatorTests/Models/OperatorAPIAdapterTests.swift`
  - Failure: stale expectation for `resume_postmark` no longer matched the canonical hyphenated capability value (`resume-postmark`) returned by the generated-client-backed adapter.
  - Fix: align the assertion to the canonical payload shape instead of rewriting the adapter to legacy expectations.
- Older security/helper suites failed because they were asserting APIs or helper behavior that no longer exists after Swift 6 actor isolation and the current security abstractions.
  - Fix: rewrite the suites that still validate the current architecture (`APIRequestValidatorTests`, `AppSandboxManagerTests`, `CertificatePinningTests`, integration helpers).

### Remaining quarantine
- These suites remain excluded from the package test target and are not part of the restored Phase 4 certification signal:
  - `Performance/UIResponsivenessTests.swift`
  - `Security/KeychainTests.swift`
  - `Security/MemorySafetyTests.swift`
  - `Security/SecureConfigurationStoreTests.swift`
- Rationale:
  - they are not required to certify the generated-client operator workflow path
  - they still need deeper Swift 6 concurrency cleanup and/or helper redesign
  - keeping them active would make the package gate noisy again without improving Tier-1 operator confidence

## 2026-06-13 — Railway deploy wrapper and Prisma migration path mismatch

### Failure observed
- The clean release worktree for the Postmark inbound adapter could not deploy with `railway up` until a Dockerfile wrapper was present in the upload.
- `prisma migrate deploy` run through `railway run` still used the private `postgres.railway.internal` URL and failed from the workstation.

### Root cause
- BlackBolt Railway production uses a Dockerfile wrapper that clones a pushed Git ref during build, so a release worktree without that wrapper cannot be built by Railway.
- Local migration runs need the public Postgres URL; the private Railway hostname is only reachable from inside Railway.

### Fix applied
- Used a temporary deploy-only Dockerfile wrapper and a pushed clean release branch ref for the Railway build.
- Ran production migrations against `DATABASE_PUBLIC_URL` instead of the private host.

### Consequence
- Production deploys for this path are now documented as a two-step process: make the release ref reachable to the Dockerfile build, then migrate using the public database connection from outside Railway.
