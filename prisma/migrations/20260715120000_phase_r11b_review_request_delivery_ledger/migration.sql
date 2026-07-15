CREATE TABLE "review_request_deliveries" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "batch_key" text NOT NULL,
  "recipient_fingerprint" text NOT NULL,
  "status" text NOT NULL,
  "provider_message_id" text,
  "error_code" text,
  "sent_at" timestamp(3),
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "review_request_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "review_request_deliveries_tenant_id_batch_key_recipient_fingerp_key"
  ON "review_request_deliveries"("tenant_id", "batch_key", "recipient_fingerprint");

CREATE INDEX "review_request_deliveries_tenant_id_batch_key_idx"
  ON "review_request_deliveries"("tenant_id", "batch_key");

CREATE INDEX "review_request_deliveries_tenant_id_status_idx"
  ON "review_request_deliveries"("tenant_id", "status");

ALTER TABLE "review_request_deliveries"
  ADD CONSTRAINT "review_request_deliveries_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
