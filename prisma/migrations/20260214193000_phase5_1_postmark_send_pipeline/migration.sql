CREATE TYPE "CampaignMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'SENT_SIMULATED', 'FAILED', 'PAUSED');
CREATE TYPE "DeliveryState" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'SPAMCOMPLAINT', 'UNSUBSCRIBED');

ALTER TABLE "campaign_messages"
  ADD COLUMN "delivery_state" "DeliveryState",
  ALTER COLUMN "status" TYPE "CampaignMessageStatus" USING UPPER("status")::"CampaignMessageStatus",
  ALTER COLUMN "status" SET DEFAULT 'QUEUED';

ALTER TABLE "send_events"
  ADD COLUMN "provider_message_id" TEXT;

CREATE INDEX "send_events_tenant_id_provider_message_id_idx"
  ON "send_events"("tenant_id", "provider_message_id");
