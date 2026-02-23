-- Phase 9: portfolio operator auth, review queue, and mandatory approval controls

ALTER TABLE "tenants"
  ADD COLUMN "time_zone" TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE "operator_portfolio_credentials" (
  "id" TEXT NOT NULL,
  "label" TEXT,
  "key_hash" TEXT NOT NULL,
  "key_hint" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "rotated_at" TIMESTAMP(3),
  "rotated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operator_portfolio_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operator_portfolio_tenant_memberships" (
  "id" TEXT NOT NULL,
  "credential_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operator_portfolio_tenant_memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operator_portfolio_credentials_active_idx"
  ON "operator_portfolio_credentials"("active");

CREATE UNIQUE INDEX "operator_portfolio_tenant_memberships_credential_id_tenant_id_key"
  ON "operator_portfolio_tenant_memberships"("credential_id", "tenant_id");

CREATE INDEX "operator_portfolio_tenant_memberships_tenant_id_idx"
  ON "operator_portfolio_tenant_memberships"("tenant_id");

ALTER TABLE "operator_portfolio_tenant_memberships"
  ADD CONSTRAINT "operator_portfolio_tenant_memberships_credential_id_fkey"
  FOREIGN KEY ("credential_id") REFERENCES "operator_portfolio_credentials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_portfolio_tenant_memberships"
  ADD CONSTRAINT "operator_portfolio_tenant_memberships_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_items"
  ADD COLUMN "campaign_run_id" TEXT,
  ADD COLUMN "subject_line" TEXT,
  ADD COLUMN "body_text" TEXT,
  ADD COLUMN "segment_mode" TEXT,
  ADD COLUMN "send_window_at" TIMESTAMP(3),
  ADD COLUMN "rejected_at" TIMESTAMP(3),
  ADD COLUMN "rejected_by_user_id" TEXT,
  ADD COLUMN "rejection_reason" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "approval_items_tenant_id_campaign_run_id_key"
  ON "approval_items"("tenant_id", "campaign_run_id");

CREATE INDEX "approval_items_tenant_id_status_created_at_idx"
  ON "approval_items"("tenant_id", "status", "created_at");

ALTER TABLE "approval_items"
  ADD CONSTRAINT "approval_items_campaign_run_id_fkey"
  FOREIGN KEY ("campaign_run_id") REFERENCES "campaign_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "review_queue_items" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "review_id" TEXT NOT NULL,
  "campaign_run_id" TEXT,
  "trigger_review_id" TEXT,
  "state" TEXT NOT NULL,
  "rating" INTEGER,
  "service_mentioned" TEXT,
  "key_benefit" TEXT,
  "confidence" DECIMAL(5,4) NOT NULL,
  "classified_at" TIMESTAMP(3),
  "awaiting_approval_at" TIMESTAMP(3),
  "scheduled_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_queue_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "review_queue_items_tenant_id_review_id_key"
  ON "review_queue_items"("tenant_id", "review_id");

CREATE INDEX "review_queue_items_tenant_id_state_updated_at_idx"
  ON "review_queue_items"("tenant_id", "state", "updated_at");

CREATE INDEX "review_queue_items_tenant_id_campaign_run_id_idx"
  ON "review_queue_items"("tenant_id", "campaign_run_id");

ALTER TABLE "review_queue_items"
  ADD CONSTRAINT "review_queue_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "review_queue_items"
  ADD CONSTRAINT "review_queue_items_review_id_fkey"
  FOREIGN KEY ("review_id") REFERENCES "reviews"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "review_queue_items"
  ADD CONSTRAINT "review_queue_items_campaign_run_id_fkey"
  FOREIGN KEY ("campaign_run_id") REFERENCES "campaign_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
