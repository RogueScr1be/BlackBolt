CREATE TABLE "sos_cases" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "consult_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "stripe_payment_intent_id" TEXT NOT NULL,
  "drive_folder_id" TEXT,
  "drive_folder_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sos_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sos_case_payloads" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "canonical_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sos_case_payloads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sos_artifacts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "artifact_type" TEXT NOT NULL,
  "template_id" TEXT,
  "file_name" TEXT NOT NULL,
  "drive_file_id" TEXT,
  "url" TEXT,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sos_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sos_stripe_webhook_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "payment_intent_id" TEXT,
  "event_type" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "payload_redacted_json" JSONB NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  "process_status" TEXT NOT NULL DEFAULT 'PENDING',
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sos_stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sos_cases_tenant_id_stripe_payment_intent_id_key" ON "sos_cases"("tenant_id", "stripe_payment_intent_id");
CREATE INDEX "sos_cases_tenant_id_created_at_idx" ON "sos_cases"("tenant_id", "created_at");

CREATE UNIQUE INDEX "sos_case_payloads_case_id_version_key" ON "sos_case_payloads"("case_id", "version");
CREATE INDEX "sos_case_payloads_case_id_created_at_idx" ON "sos_case_payloads"("case_id", "created_at");

CREATE UNIQUE INDEX "sos_artifacts_case_id_artifact_type_key" ON "sos_artifacts"("case_id", "artifact_type");
CREATE INDEX "sos_artifacts_tenant_id_created_at_idx" ON "sos_artifacts"("tenant_id", "created_at");

CREATE UNIQUE INDEX "sos_stripe_webhook_events_provider_event_id_key" ON "sos_stripe_webhook_events"("provider_event_id");
CREATE INDEX "sos_stripe_webhook_events_tenant_id_process_status_created_at_idx" ON "sos_stripe_webhook_events"("tenant_id", "process_status", "created_at");

ALTER TABLE "sos_cases"
  ADD CONSTRAINT "sos_cases_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sos_case_payloads"
  ADD CONSTRAINT "sos_case_payloads_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "sos_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sos_artifacts"
  ADD CONSTRAINT "sos_artifacts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sos_artifacts"
  ADD CONSTRAINT "sos_artifacts_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "sos_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sos_stripe_webhook_events"
  ADD CONSTRAINT "sos_stripe_webhook_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
