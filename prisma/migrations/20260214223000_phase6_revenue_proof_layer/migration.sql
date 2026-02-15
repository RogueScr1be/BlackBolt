-- Phase 6: Revenue Proof Layer (data spine only)
-- Idempotent revenue events + conservative attribution links.

CREATE TYPE "RevenueEventKind" AS ENUM ('INVOICE', 'PAYMENT', 'SALE');
CREATE TYPE "RevenueEventSource" AS ENUM ('MANUAL', 'IMPORT', 'API');
CREATE TYPE "RevenueAttributionModel" AS ENUM ('LAST_TOUCH');

CREATE TABLE "revenue_events" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "amount_cents" INTEGER NOT NULL CHECK ("amount_cents" > 0),
  "currency" VARCHAR(3) NOT NULL,
  "kind" "RevenueEventKind" NOT NULL,
  "source" "RevenueEventSource" NOT NULL,
  "external_id" VARCHAR(128),
  "customer_id" TEXT REFERENCES "customers"("id") ON DELETE SET NULL,
  "description" VARCHAR(240),
  "idempotency_key" VARCHAR(160) NOT NULL,
  "redacted_metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "revenue_events_tenant_occurred_at_idx"
  ON "revenue_events" ("tenant_id", "occurred_at");

CREATE UNIQUE INDEX "revenue_events_tenant_idempotency_key_uq"
  ON "revenue_events" ("tenant_id", "idempotency_key");

-- Allows multiple NULL external_id rows (Postgres behavior), but prevents duplicate non-null.
CREATE UNIQUE INDEX "revenue_events_tenant_source_external_id_uq"
  ON "revenue_events" ("tenant_id", "source", "external_id");

CREATE TABLE "revenue_attributions" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "model" "RevenueAttributionModel" NOT NULL DEFAULT 'LAST_TOUCH',
  "revenue_event_id" TEXT NOT NULL REFERENCES "revenue_events"("id") ON DELETE CASCADE,
  "campaign_message_id" TEXT NOT NULL REFERENCES "campaign_messages"("id") ON DELETE CASCADE,
  "attributed_cents" INTEGER NOT NULL CHECK ("attributed_cents" >= 0),
  "is_direct" BOOLEAN NOT NULL,
  "dedupe_key" VARCHAR(96) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "revenue_attributions_tenant_created_at_idx"
  ON "revenue_attributions" ("tenant_id", "created_at");

CREATE INDEX "revenue_attributions_tenant_campaign_message_idx"
  ON "revenue_attributions" ("tenant_id", "campaign_message_id");

CREATE UNIQUE INDEX "revenue_attributions_tenant_dedupe_key_uq"
  ON "revenue_attributions" ("tenant_id", "dedupe_key");
