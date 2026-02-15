ALTER TABLE "campaign_messages"
  ADD COLUMN "claimed_at" TIMESTAMP(3),
  ADD COLUMN "claimed_by" TEXT,
  ADD COLUMN "send_attempt" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "postmark_send_controls" (
  "tenant_id" TEXT NOT NULL,
  "paused_until" TIMESTAMP(3),
  "pause_reason" TEXT,
  "last_error_class" TEXT,
  "resume_checklist_ack" BOOLEAN NOT NULL DEFAULT false,
  "resume_checklist_ack_actor" TEXT,
  "resume_checklist_ack_at" TIMESTAMP(3),
  "policy_version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "postmark_send_controls_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "postmark_send_controls"
  ADD CONSTRAINT "postmark_send_controls_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
