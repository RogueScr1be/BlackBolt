/**
 * ApprovalSummary - Lean list item for approvals
 * Used in paginated list responses
 */
export interface ApprovalSummary {
  id: string;
  tenantId: string;
  status: string; // 'queued' | 'approved' | 'rejected'
  requiredRole: string;
  draftMessageId: string;
  runId: string | null;
  createdAt: string; // ISO8601
  approvedAt: string | null; // ISO8601 or null
  rejectedAt: string | null; // ISO8601 or null
}

/**
 * DraftMessageDetail - Draft message with full content
 * Included in approval detail response
 */
export interface DraftMessageDetail {
  id: string;
  reviewId: string | null;
  customerId: string;
  status: string;
  bodyText: string; // ← MUST INCLUDE: operator needs to read draft content
  createdAt: string; // ISO8601
  updatedAt: string; // ISO8601
}

/**
 * CampaignRunDetail - Campaign run summary
 * Included in approval detail response if runId is present
 */
export interface CampaignRunDetail {
  id: string;
  status: string; // 'RUNNING' | 'PAUSED'
  sendWindowAt: string | null; // ISO8601 or null
  recipientsTotal: number;
  createdAt: string; // ISO8601
}

/**
 * ApprovalDetail - Full approval item with relationships
 * Used in detail endpoint response
 */
export interface ApprovalDetail {
  id: string;
  tenantId: string;
  status: string; // 'queued' | 'approved' | 'rejected'
  requiredRole: string;
  draftMessageId: string;
  runId: string | null;
  createdAt: string; // ISO8601
  approvedAt: string | null; // ISO8601 or null
  approvedByUserId: string | null;
  rejectedAt: string | null; // ISO8601 or null
  rejectedReason: string | null;
  draftMessage: DraftMessageDetail;
  campaignRun: CampaignRunDetail | null;
}

/**
 * GetApprovalsInput - Query parameters for list endpoint
 */
export interface GetApprovalsInput {
  tenantId: string;
  limit: number; // Already clamped to 1..200 by controller
  cursor?: string; // Optional ID-based pagination cursor
  status?: string; // Optional filter: 'queued' | 'approved' | 'rejected'
  runId?: string; // Optional filter by campaign run ID
}

/**
 * GetApprovalsResponse - Paginated list response
 */
export interface GetApprovalsResponse {
  items: ApprovalSummary[];
  nextCursor: string | null;
}

/**
 * ApproveApprovalItemInput - Request body for approve endpoint
 */
export interface ApproveApprovalItemInput {
  // Empty or optional; reserved for future use
}

/**
 * ApproveApprovalItemResponse - Response envelope for approve endpoint
 * Stub response (Agent 3 implements actual state change)
 */
export interface ApproveApprovalItemResponse {
  ok: true;
  intervention: 'approve-approval-item';
  approval_id: string;
  status: 'approved';
  run_id: string | null;
  draft_message_id: string;
  message_released: false; // Stub value
}

/**
 * RejectApprovalItemInput - Request body for reject endpoint
 */
export interface RejectApprovalItemInput {
  reason?: string;
}

/**
 * RejectApprovalItemResponse - Response envelope for reject endpoint
 * Stub response (Agent 3 implements actual state change)
 */
export interface RejectApprovalItemResponse {
  ok: true;
  intervention: 'reject-approval-item';
  approval_id: string;
  status: 'rejected';
  run_id: string | null;
  draft_message_id: string;
  reason: string | null;
}

/**
 * ApprovalDraftEditRequest - Request body for edit draft endpoint
 * Contains the new draft content and optimistic lock timestamp
 */
export interface ApprovalDraftEditRequest {
  bodyText: string; // Draft body content (must start with "Subject: ")
  expectedUpdatedAt: string; // ISO8601 timestamp for optimistic locking
}

/**
 * ApprovalDraftEditResponse - Response envelope for edit draft endpoint
 * Confirms the draft edit with updated metadata
 */
export interface ApprovalDraftEditResponse {
  ok: true;
  intervention: 'edit-approval-draft';
  approval_id: string;
  draft_message_id: string;
  draft_updated_at: string; // ISO8601 timestamp after update
  subject_extracted: string | null; // Extracted subject line from draft body
}
