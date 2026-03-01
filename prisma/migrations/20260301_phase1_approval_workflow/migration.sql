-- Phase 1: Add approval workflow fields to ApprovalItem
-- Links ApprovalItem to CampaignRun for transactional approval workflows
-- Enables rejection tracking with timestamps and reasoning

-- Add runId (nullable FK to CampaignRun, SetNull on cascade)
ALTER TABLE approval_items ADD COLUMN run_id TEXT;

-- Add rejectedAt timestamp for rejection tracking
ALTER TABLE approval_items ADD COLUMN rejected_at TIMESTAMP;

-- Add rejectedReason text for recording rejection rationale
ALTER TABLE approval_items ADD COLUMN rejected_reason TEXT;

-- Create FK constraint from approval_items to campaign_runs
-- Using SetNull cascade so existing approvals aren't orphaned
ALTER TABLE approval_items 
ADD CONSTRAINT approval_items_run_id_fkey
FOREIGN KEY (run_id) REFERENCES campaign_runs(id) ON DELETE SET NULL;

-- Add index for efficient runId filtering and status queries
CREATE INDEX approval_items_run_id_idx ON approval_items(run_id);
CREATE INDEX approval_items_status_idx ON approval_items(status);
CREATE INDEX approval_items_tenant_status_idx ON approval_items(tenant_id, status);

-- DOWN (manual recovery if needed):
-- DROP INDEX approval_items_tenant_status_idx;
-- DROP INDEX approval_items_status_idx;
-- DROP INDEX approval_items_run_id_idx;
-- ALTER TABLE approval_items DROP CONSTRAINT approval_items_run_id_fkey;
-- ALTER TABLE approval_items DROP COLUMN rejected_reason;
-- ALTER TABLE approval_items DROP COLUMN rejected_at;
-- ALTER TABLE approval_items DROP COLUMN run_id;
