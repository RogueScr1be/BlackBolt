ALTER TABLE "campaign_messages"
  ADD COLUMN "provider_message_id" TEXT;

CREATE UNIQUE INDEX "campaign_messages_tenant_id_provider_message_id_key"
  ON "campaign_messages"("tenant_id", "provider_message_id");

CREATE TABLE "postmark_webhook_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "provider_event_id" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "event_type" TEXT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  "payload_redacted_json" JSONB NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "reconcile_status" TEXT NOT NULL DEFAULT 'PENDING',
  "reconcile_attempts" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "last_error" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "postmark_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "postmark_webhook_events_provider_event_id_key"
  ON "postmark_webhook_events"("provider_event_id");

CREATE INDEX "postmark_webhook_events_tenant_id_created_at_idx"
  ON "postmark_webhook_events"("tenant_id", "created_at");

CREATE INDEX "postmark_webhook_events_reconcile_status_next_retry_at_idx"
  ON "postmark_webhook_events"("reconcile_status", "next_retry_at");

ALTER TABLE "postmark_webhook_events"
  ADD CONSTRAINT "postmark_webhook_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
