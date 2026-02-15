ALTER TABLE "postmark_webhook_events"
  ADD COLUMN "source_ip" TEXT;

CREATE INDEX "postmark_webhook_events_source_ip_created_at_idx"
  ON "postmark_webhook_events"("source_ip", "created_at");
