-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "customer_segment" AS ENUM ('SEGMENT_0_90', 'SEGMENT_90_365', 'SEGMENT_365_PLUS');

-- AlterTable
ALTER TABLE "customers"
  ADD COLUMN "last_service_date" TIMESTAMP(3),
  ADD COLUMN "segment" "customer_segment" NOT NULL DEFAULT 'SEGMENT_365_PLUS';

-- CreateTable
CREATE TABLE "customer_imports" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" "import_status" NOT NULL DEFAULT 'QUEUED',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "processed_rows" INTEGER NOT NULL DEFAULT 0,
  "succeeded_rows" INTEGER NOT NULL DEFAULT 0,
  "failed_rows" INTEGER NOT NULL DEFAULT 0,
  "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
  "error_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),

  CONSTRAINT "customer_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_imports_tenant_id_status_idx" ON "customer_imports"("tenant_id", "status");

-- CreateTable
CREATE TABLE "customer_import_rows" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "import_id" TEXT NOT NULL,
  "row_num" INTEGER NOT NULL,
  "raw_json" JSONB NOT NULL,
  "normalized_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_import_rows_tenant_id_import_id_row_num_key" ON "customer_import_rows"("tenant_id", "import_id", "row_num");
CREATE INDEX "customer_import_rows_tenant_id_import_id_idx" ON "customer_import_rows"("tenant_id", "import_id");

-- CreateTable
CREATE TABLE "suppression_imports" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" "import_status" NOT NULL DEFAULT 'QUEUED',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "processed_rows" INTEGER NOT NULL DEFAULT 0,
  "succeeded_rows" INTEGER NOT NULL DEFAULT 0,
  "failed_rows" INTEGER NOT NULL DEFAULT 0,
  "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
  "error_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),

  CONSTRAINT "suppression_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "suppression_imports_tenant_id_status_idx" ON "suppression_imports"("tenant_id", "status");

-- CreateTable
CREATE TABLE "suppression_import_rows" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "import_id" TEXT NOT NULL,
  "row_num" INTEGER NOT NULL,
  "raw_json" JSONB NOT NULL,
  "normalized_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "suppression_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppression_import_rows_tenant_id_import_id_row_num_key" ON "suppression_import_rows"("tenant_id", "import_id", "row_num");
CREATE INDEX "suppression_import_rows_tenant_id_import_id_idx" ON "suppression_import_rows"("tenant_id", "import_id");

-- CreateTable
CREATE TABLE "suppression_entries" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "email" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "suppression_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppression_entries_tenant_id_email_channel_key" ON "suppression_entries"("tenant_id", "email", "channel");
CREATE INDEX "suppression_entries_tenant_id_active_idx" ON "suppression_entries"("tenant_id", "active");

-- AddForeignKey
ALTER TABLE "customer_imports" ADD CONSTRAINT "customer_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_import_rows" ADD CONSTRAINT "customer_import_rows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_import_rows" ADD CONSTRAINT "customer_import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "customer_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppression_imports" ADD CONSTRAINT "suppression_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppression_import_rows" ADD CONSTRAINT "suppression_import_rows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppression_import_rows" ADD CONSTRAINT "suppression_import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "suppression_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
