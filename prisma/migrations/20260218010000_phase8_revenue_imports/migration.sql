-- Phase 8: revenue CSV imports

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ImportStatus' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');
  END IF;
END
$$;

CREATE TABLE "revenue_imports" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "processed_rows" INTEGER NOT NULL DEFAULT 0,
  "succeeded_rows" INTEGER NOT NULL DEFAULT 0,
  "failed_rows" INTEGER NOT NULL DEFAULT 0,
  "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" TEXT NOT NULL,
  "error_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "revenue_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "revenue_import_rows" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "import_id" TEXT NOT NULL,
  "row_num" INTEGER NOT NULL,
  "raw_json" JSONB NOT NULL,
  "normalized_json" JSONB,
  "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "revenue_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "revenue_imports_tenant_id_idempotency_key_key" ON "revenue_imports"("tenant_id", "idempotency_key");
CREATE INDEX "revenue_imports_tenant_id_status_idx" ON "revenue_imports"("tenant_id", "status");

CREATE UNIQUE INDEX "revenue_import_rows_tenant_id_import_id_row_num_key" ON "revenue_import_rows"("tenant_id", "import_id", "row_num");
CREATE INDEX "revenue_import_rows_tenant_id_import_id_status_idx" ON "revenue_import_rows"("tenant_id", "import_id", "status");

ALTER TABLE "revenue_imports"
  ADD CONSTRAINT "revenue_imports_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "revenue_import_rows"
  ADD CONSTRAINT "revenue_import_rows_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "revenue_import_rows"
  ADD CONSTRAINT "revenue_import_rows_import_id_fkey"
  FOREIGN KEY ("import_id") REFERENCES "revenue_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
