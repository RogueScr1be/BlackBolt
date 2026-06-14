-- CreateTable
CREATE TABLE "review_alert_emails" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'google_email_alert',
    "source_mailbox" TEXT,
    "from_email" TEXT,
    "subject" VARCHAR(500),
    "received_at" TIMESTAMP(3) NOT NULL,
    "raw_hash" TEXT NOT NULL,
    "parsed_status" TEXT NOT NULL,
    "parsed_rating" INTEGER,
    "parsed_reviewer_name" TEXT,
    "parsed_business_name" TEXT,
    "parsed_review_snippet" TEXT,
    "parsed_review_url" TEXT,
    "parse_confidence" DECIMAL(5,4) NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_alert_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_alert_emails_tenant_id_created_at_idx" ON "review_alert_emails"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "review_alert_emails_tenant_id_parsed_status_idx" ON "review_alert_emails"("tenant_id", "parsed_status");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "review_alert_emails_tenant_id_provider_provider_message_id_key" ON "review_alert_emails"("tenant_id", "provider", "provider_message_id");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "review_alert_emails_tenant_id_raw_hash_key" ON "review_alert_emails"("tenant_id", "raw_hash");

-- AddForeignKey
ALTER TABLE "review_alert_emails" ADD CONSTRAINT "review_alert_emails_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
