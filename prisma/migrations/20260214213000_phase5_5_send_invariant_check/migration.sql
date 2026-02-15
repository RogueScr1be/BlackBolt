-- Phase 5.5: enforce send-state invariant at rest
-- delivery_state = 'SENT' must always have provider_message_id.

ALTER TABLE "campaign_messages"
ADD CONSTRAINT "campaign_messages_sent_requires_provider_message_id"
CHECK (
  "delivery_state" IS DISTINCT FROM 'SENT'
  OR "provider_message_id" IS NOT NULL
) NOT VALID;

ALTER TABLE "campaign_messages"
VALIDATE CONSTRAINT "campaign_messages_sent_requires_provider_message_id";
