# Automation Policy (Phase 0 Baseline)

## Scope
Applies to all Black Bolt automated actions across lanes 1-5.

## Global Constraints
1. No PHI storage.
2. Monolith only (NestJS).
3. Prisma only.
4. No scraper ingestion; GBP API only.
5. Postmark only for email.

## Confidence Thresholds
1. Low risk auto-action: `>= 0.80`
2. Medium risk auto-action: `>= 0.90`
3. High risk auto-action: `>= 0.97`
4. Critical risk: manual approval required

## Throttles (Default)
1. Automated sends per tenant: `120/hour`
2. Campaign launches per tenant: `4/hour`
3. Global Postmark send rate soft cap: `30/sec`
4. GBP ingest cap per tenant: `5/sec`
5. GBP global ingest cap: `40/sec`

## Auto-Pause Triggers
1. Bounce rate `> 5%` over 1h or `> 3%` over 24h.
2. Spam complaint rate `> 0.1%` over 24h.
3. Provider/API 5xx rate `> 2%` over 15m.
4. Queue failure rate `> 10%` over 15m.
5. Webhook signature failures `> 10` over 10m.

## Recovery Requirements
1. Pause affected lane immediately when trigger fires.
2. Open incident and capture audit trail.
3. Execute lane-specific recovery checklist.
4. Resume only with explicit operator approval.
