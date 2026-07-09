-- CreateTable
CREATE TABLE "review_operator_actions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "suggested_text" TEXT,
    "safety_flags" JSONB NOT NULL,
    "confidence" DECIMAL(5,4),
    "created_by_kind" TEXT NOT NULL DEFAULT 'system',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_operator_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_operator_actions_tenant_id_status_idx" ON "review_operator_actions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "review_operator_actions_tenant_id_created_at_idx" ON "review_operator_actions"("tenant_id", "created_at");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "review_operator_actions_tenant_id_review_id_action_type_key" ON "review_operator_actions"("tenant_id", "review_id", "action_type");

-- AddForeignKey
ALTER TABLE "review_operator_actions" ADD CONSTRAINT "review_operator_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_operator_actions" ADD CONSTRAINT "review_operator_actions_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
