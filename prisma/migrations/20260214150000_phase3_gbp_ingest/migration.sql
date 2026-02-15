-- AlterTable
ALTER TABLE "tenants"
  ADD COLUMN "gbp_account_id" TEXT,
  ADD COLUMN "gbp_location_id" TEXT,
  ADD COLUMN "gbp_access_token_ref" TEXT;

-- AlterTable
ALTER TABLE "reviews"
  RENAME COLUMN "external_review_id" TO "source_review_id";
ALTER TABLE "reviews"
  RENAME COLUMN "occurred_at" TO "reviewed_at";
ALTER TABLE "reviews"
  RENAME COLUMN "review_body" TO "body";
ALTER TABLE "reviews"
  ADD COLUMN "reviewer_name" TEXT,
  ADD COLUMN "raw_json" JSONB;
ALTER TABLE "reviews"
  ALTER COLUMN "customer_id" DROP NOT NULL;

ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_customer_id_fkey";
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Replace prior unique index with source-aware unique
DROP INDEX IF EXISTS "reviews_tenant_id_external_review_id_key";
CREATE UNIQUE INDEX "reviews_tenant_id_source_source_review_id_key"
  ON "reviews"("tenant_id", "source", "source_review_id");

-- CreateTable
CREATE TABLE "integration_alerts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "integration" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),

  CONSTRAINT "integration_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integration_alerts_tenant_id_created_at_idx"
  ON "integration_alerts"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "integration_alerts"
  ADD CONSTRAINT "integration_alerts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
