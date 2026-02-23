-- Phase 7: campaign runs + per-tenant operator credentials

CREATE TABLE "campaign_runs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "trigger_review_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "segment_mode" TEXT NOT NULL,
  "send_window_at" TIMESTAMP(3) NOT NULL,
  "recipients_total" INTEGER NOT NULL DEFAULT 0,
  "messages_queued" INTEGER NOT NULL DEFAULT 0,
  "messages_sent" INTEGER NOT NULL DEFAULT 0,
  "messages_failed" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" TEXT,
  "last_error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campaign_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operator_credentials" (
  "tenant_id" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "key_hint" TEXT NOT NULL,
  "rotated_at" TIMESTAMP(3),
  "rotated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operator_credentials_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "campaign_messages" ADD COLUMN "campaign_run_id" TEXT;

CREATE INDEX "campaign_runs_tenant_id_created_at_idx" ON "campaign_runs"("tenant_id", "created_at");
CREATE INDEX "campaign_runs_tenant_id_status_idx" ON "campaign_runs"("tenant_id", "status");
CREATE INDEX "campaign_messages_tenant_id_campaign_run_id_idx" ON "campaign_messages"("tenant_id", "campaign_run_id");

ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_trigger_review_id_fkey" FOREIGN KEY ("trigger_review_id") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_campaign_run_id_fkey" FOREIGN KEY ("campaign_run_id") REFERENCES "campaign_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operator_credentials" ADD CONSTRAINT "operator_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
