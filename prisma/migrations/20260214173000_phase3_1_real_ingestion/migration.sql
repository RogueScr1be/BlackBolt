-- AlterTable
ALTER TABLE "tenants"
  ADD COLUMN "gbp_integration_status" TEXT NOT NULL DEFAULT 'DISCONNECTED';

-- AlterTable
ALTER TABLE "reviews"
  RENAME COLUMN "raw_json" TO "redacted_json";
ALTER TABLE "reviews"
  ADD COLUMN "payload_hash" TEXT;

-- CreateTable
CREATE TABLE "gbp_sync_states" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "next_page_token" TEXT,
  "last_seen_review_at" TIMESTAMP(3),
  "last_success_at" TIMESTAMP(3),
  "cooldown_until" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "gbp_sync_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gbp_sync_states_tenant_id_location_id_key"
  ON "gbp_sync_states"("tenant_id", "location_id");
CREATE INDEX "gbp_sync_states_tenant_id_cooldown_until_idx"
  ON "gbp_sync_states"("tenant_id", "cooldown_until");

-- AddForeignKey
ALTER TABLE "gbp_sync_states"
  ADD CONSTRAINT "gbp_sync_states_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
