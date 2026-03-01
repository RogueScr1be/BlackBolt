import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  GetApprovalsInput,
  GetApprovalsResponse,
  ApprovalDetail,
  ApprovalSummary,
  ApprovalDraftEditResponse
} from './approvals.types';

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get paginated approval items with optional filters.
   *
   * Uses cursor-based pagination (id asc) for deterministic ordering.
   * Supports optional filters on status and runId.
   *
   * @param input.tenantId - Required tenant ID
   * @param input.limit - Fetch limit (already clamped to 1..200 by controller)
   * @param input.cursor - Optional pagination cursor (ApprovalItem id)
   * @param input.status - Optional status filter ('queued' | 'approved' | 'rejected')
   * @param input.runId - Optional campaign run ID filter
   * @returns Paginated items + nextCursor for continuation
   */
  async getApprovals(input: GetApprovalsInput): Promise<GetApprovalsResponse> {
    // Validate tenantId
    if (!input.tenantId || typeof input.tenantId !== 'string') {
      throw new BadRequestException('tenantId is required');
    }

    // Build where clause for ApprovalItem
    const where: any = {
      tenantId: input.tenantId
    };

    if (input.status) {
      const validStatuses = ['queued', 'approved', 'rejected'];
      const normalizedStatus = input.status.toLowerCase();
      if (!validStatuses.includes(normalizedStatus)) {
        throw new BadRequestException(
          `Invalid status: ${input.status}. Must be one of: ${validStatuses.join(', ')}`
        );
      }
      where.status = normalizedStatus;
    }

    if (input.runId) {
      where.runId = input.runId;
    }

    // Execute Prisma query with cursor pagination
    // Fetch limit + 1 to determine hasNext
    const rows = await this.prisma.approvalItem.findMany({
      where,
      take: input.limit + 1,
      ...(input.cursor
        ? {
            cursor: { id: input.cursor },
            skip: 1
          }
        : {}),
      orderBy: { id: 'asc' }
    });

    // Determine if there are more items
    const hasNext = rows.length > input.limit;
    const items = hasNext ? rows.slice(0, input.limit) : rows;

    // Map to response items
    const mappedItems: ApprovalSummary[] = items.map((approval) =>
      this.mapToApprovalSummary(approval)
    );

    return {
      items: mappedItems,
      nextCursor: hasNext ? items[items.length - 1]?.id ?? null : null
    };
  }

  /**
   * Get full approval item with relationships.
   *
   * Loads ApprovalItem by { id, tenantId } and includes:
   * - draftMessage (with bodyText for operator review)
   * - campaignRun (if runId is present)
   *
   * @param tenantId - Tenant ID
   * @param approvalId - Approval item ID
   * @returns Full approval detail with relationships
   * @throws NotFoundException if not found or wrong tenant
   */
  async getApprovalDetail(
    tenantId: string,
    approvalId: string
  ): Promise<ApprovalDetail> {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new BadRequestException('tenantId is required');
    }

    if (!approvalId || typeof approvalId !== 'string') {
      throw new BadRequestException('approvalId is required');
    }

    const approval = await this.prisma.approvalItem.findFirst({
      where: { id: approvalId, tenantId },
      include: {
        draftMessage: true,
        campaignRun: true
      }
    });

    if (!approval) {
      throw new NotFoundException('Approval item not found');
    }

    return this.mapToApprovalDetail(approval);
  }

  /**
   * Approve an approval item, releasing ONLY the tied CampaignMessage.
   *
   * Core invariant: Approving ONE approval item releases ONLY the CampaignMessage
   * tied to that draftMessageId, NOT the entire run.
   *
   * Transactional: All state changes succeed or all fail (atomic).
   *
   * If runId is null, approval transition fails with 409 Conflict.
   *
   * After approval, if ALL remaining messages in the run are now QUEUED,
   * and the run is still PAUSED, automatically promote run to RUNNING.
   */
  async approveApprovalItem(
    tenantId: string,
    approvalId: string,
    operatorUserId?: string
  ): Promise<{
    ok: true;
    intervention: 'approve-approval-item';
    approval_id: string;
    status: 'approved';
    run_id: string;
    draft_message_id: string;
    message_released: boolean;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Load approval item (required fields)
      const approval = await tx.approvalItem.findUnique({
        where: { id: approvalId },
        select: {
          id: true,
          tenantId: true,
          status: true,
          draftMessageId: true,
          runId: true
        }
      });

      // Validation
      if (!approval) {
        throw new NotFoundException(`Approval item ${approvalId} not found`);
      }
      if (approval.tenantId !== tenantId) {
        throw new ForbiddenException('Cannot access approval from another tenant');
      }

      // Step 2: Update ApprovalItem with conditional status check
      // CRITICAL: Use conditional WHERE to prevent race condition where two concurrent
      // requests both read status='queued' before either completes the update.
      // If WHERE doesn't match (status is not 'queued'), updateMany returns count=0.
      const updateResult = await tx.approvalItem.updateMany({
        where: {
          id: approvalId,
          status: 'queued'  // CONDITIONAL - only update if still queued
        },
        data: {
          status: 'approved',
          approvedAt: new Date(),
          approvedByUserId: operatorUserId || null
        }
      });

      // If count === 0, status is no longer 'queued' (already approved/rejected)
      if (updateResult.count === 0) {
        throw new BadRequestException('This approval has already been decided');
      }

      // Validate runId is set (required for message release and run promotion)
      if (!approval.runId) {
        throw new ConflictException('Approval item has no linked campaign run; cannot release');
      }

      // Step 3: Update CampaignMessage (release to QUEUED)
      const releasedMessages = await tx.campaignMessage.updateMany({
        where: {
          tenantId,
          campaignRunId: approval.runId,
          draftMessageId: approval.draftMessageId,
          status: 'PAUSED'
        },
        data: {
          status: 'QUEUED'
        }
      });

      // CRITICAL: Validate that the message was actually released (count > 0)
      // If count === 0, the message is already sent (status='SENT'), not PAUSED.
      // This is a silent integrity violation that must be caught.
      if (releasedMessages.count === 0) {
        throw new ConflictException(
          'Unable to release CampaignMessage. Message may have been sent, rejected, or already transitioned. ' +
          'The approval item is queued, but the tied message does not match the expected state (status=PAUSED). ' +
          'This may indicate data corruption or a timing issue in the approval workflow.'
        );
      }

      // Step 4: Optionally promote run if all approvals released
      // Query: if no more PAUSED messages without providerMessageId, and run is PAUSED, set RUNNING
      const pausedWithoutProvider = await tx.campaignMessage.count({
        where: {
          campaignRunId: approval.runId,
          status: 'PAUSED',
          providerMessageId: null
        }
      });

      if (pausedWithoutProvider === 0) {
        // All messages ready; run can be RUNNING
        const run = await tx.campaignRun.findUnique({
          where: { id: approval.runId },
          select: { status: true, startedAt: true }
        });
        if (run && run.status === 'PAUSED') {
          await tx.campaignRun.update({
            where: { id: approval.runId },
            data: {
              status: 'RUNNING',
              startedAt: run.startedAt || new Date()
            }
          });
        }
      }

      // Step 5: Audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: operatorUserId || null,
          action: 'APPROVAL_APPROVED',
          entityType: 'approval_item',
          entityId: approvalId,
          metadataJson: {
            runId: approval.runId,
            draftMessageId: approval.draftMessageId,
            messagesReleased: releasedMessages.count
          }
        }
      });

      return {
        ok: true,
        intervention: 'approve-approval-item',
        approval_id: approvalId,
        status: 'approved',
        run_id: approval.runId,
        draft_message_id: approval.draftMessageId,
        message_released: releasedMessages.count > 0
      };
    });
  }

  /**
   * Reject an approval item.
   *
   * Transactional: All state changes succeed or all fail (atomic).
   *
   * Terminal state check prevents double-decisions.
   * Ensures CampaignMessage stays PAUSED (defensive).
   * If runId exists and message somehow transitioned, force it back.
   * Only force unpublished messages (providerMessageId null).
   */
  async rejectApprovalItem(
    tenantId: string,
    approvalId: string,
    reason?: string
  ): Promise<{
    ok: true;
    intervention: 'reject-approval-item';
    approval_id: string;
    status: 'rejected';
    run_id: string | null;
    draft_message_id: string;
    reason: string | null;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Load approval item
      const approval = await tx.approvalItem.findUnique({
        where: { id: approvalId },
        select: {
          id: true,
          tenantId: true,
          status: true,
          draftMessageId: true,
          runId: true
        }
      });

      // Validation
      if (!approval) {
        throw new NotFoundException(`Approval item ${approvalId} not found`);
      }
      if (approval.tenantId !== tenantId) {
        throw new ForbiddenException('Cannot access approval from another tenant');
      }
      if (approval.status !== 'queued') {
        throw new BadRequestException('This approval has already been decided');
      }

      // Step 2: Update ApprovalItem
      const updatedApproval = await tx.approvalItem.update({
        where: { id: approvalId },
        data: {
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedReason: reason || null
        }
      });

      // Step 3: Ensure CampaignMessage stays PAUSED (defensive)
      // If runId exists and message somehow transitioned, force it back
      if (approval.runId) {
        await tx.campaignMessage.updateMany({
          where: {
            tenantId,
            campaignRunId: approval.runId,
            draftMessageId: approval.draftMessageId,
            status: { in: ['QUEUED', 'SENDING'] },
            providerMessageId: null // Only force unpublished messages
          },
          data: {
            status: 'PAUSED'
          }
        });
        // Note: If count === 0, message was already PAUSED (no-op, ok).
        // Rejection succeeds regardless of whether message was actually transitioned.
      }

      // Step 4: Audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: null, // Operator ID not captured for reject in Phase 4; can be enhanced
          action: 'APPROVAL_REJECTED',
          entityType: 'approval_item',
          entityId: approvalId,
          metadataJson: {
            runId: approval.runId,
            draftMessageId: approval.draftMessageId,
            reason: reason || null
          }
        }
      });

      return {
        ok: true,
        intervention: 'reject-approval-item',
        approval_id: approvalId,
        status: 'rejected',
        run_id: approval.runId,
        draft_message_id: approval.draftMessageId,
        reason: reason || null
      };
    });
  }

  /**
   * Edit the draft message body text of a queued approval item.
   *
   * Implements optimistic locking via expectedUpdatedAt to prevent concurrent edit conflicts.
   * Only allows editing if approval status is 'queued' and the tied CampaignMessage is PAUSED
   * and unsent (providerMessageId is null).
   *
   * Transactional: All state changes succeed or all fail (atomic).
   *
   * @param tenantId - Tenant ID for access control
   * @param approvalId - Approval item ID to edit
   * @param newBodyText - New draft message body text
   * @param expectedUpdatedAt - Expected DraftMessage.updatedAt for optimistic locking
   * @param operatorUserId - Optional user ID performing the edit (for audit)
   * @returns Response with ok=true, approval_id, draft_updated_at, and extracted subject
   * @throws NotFoundException if approval not found
   * @throws ForbiddenException if approval belongs to different tenant
   * @throws BadRequestException if approval is not in 'queued' status
   * @throws ConflictException if draft was modified by another operator or CampaignMessage is not editable
   */
  async editApprovalDraft(
    tenantId: string,
    approvalId: string,
    newBodyText: string,
    expectedUpdatedAt: Date,
    operatorUserId?: string
  ): Promise<ApprovalDraftEditResponse> {
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Load ApprovalItem (gating)
      const approval = await tx.approvalItem.findUnique({
        where: { id: approvalId },
        select: {
          id: true,
          tenantId: true,
          status: true,
          draftMessageId: true,
          runId: true
        }
      });

      // Validation: Approval must exist
      if (!approval) {
        throw new NotFoundException(`Approval item ${approvalId} not found`);
      }

      // Validation: Approval must belong to requesting tenant
      if (approval.tenantId !== tenantId) {
        throw new ForbiddenException('Cannot access approval from another tenant');
      }

      // Validation: Approval must be in 'queued' status
      if (approval.status !== 'queued') {
        throw new BadRequestException('Approval has already been decided');
      }

      // Validation: draftMessageId must be set
      if (!approval.draftMessageId) {
        throw new ConflictException('Approval item has no linked draft message; cannot edit');
      }

      // Step 2: Load CampaignMessage (send gating)
      const campaignMessage = await tx.campaignMessage.findFirst({
        where: {
          tenantId,
          id: approval.draftMessageId,
          ...(approval.runId ? { campaignRunId: approval.runId } : {}),
          status: 'PAUSED',
          providerMessageId: null
        },
        select: {
          id: true,
          status: true,
          providerMessageId: true,
          campaignRunId: true
        }
      });

      // Validation: CampaignMessage must exist and be in editable state
      if (!campaignMessage) {
        throw new ConflictException(
          'CampaignMessage is not in editable state (must be PAUSED and unsent)'
        );
      }

      // Step 3: Load existing DraftMessage (capture old state)
      const existingDraft = await tx.draftMessage.findUnique({
        where: { id: approval.draftMessageId },
        select: {
          id: true,
          bodyText: true,
          updatedAt: true
        }
      });

      if (!existingDraft) {
        throw new NotFoundException('Draft message not found');
      }

      const oldBodyText = existingDraft.bodyText;

      // Step 4: Perform conditional update (optimistic locking)
      const updateResult = await tx.draftMessage.updateMany({
        where: {
          id: approval.draftMessageId,
          updatedAt: expectedUpdatedAt // CRITICAL: Conditional WHERE for optimistic locking
        },
        data: {
          bodyText: newBodyText
          // @updatedAt will auto-increment to current time by Prisma
        }
      });

      // Validation: Optimistic lock check
      if (updateResult.count === 0) {
        throw new ConflictException(
          'Draft was modified by another operator. Refresh and retry.'
        );
      }

      // Step 5: Create AuditLog
      const oldBodyHash16 = this.sha256(oldBodyText).slice(0, 16);
      const newBodyHash16 = this.sha256(newBodyText).slice(0, 16);
      const oldSubjectExtracted = this.extractSubject(oldBodyText);
      const newSubjectExtracted = this.extractSubject(newBodyText);

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: operatorUserId || null,
          action: 'APPROVAL_DRAFT_EDITED',
          entityType: 'approval_item',
          entityId: approvalId,
          metadataJson: {
            approvalId,
            draftMessageId: approval.draftMessageId,
            campaignMessageId: campaignMessage.id,
            campaignRunId: approval.runId || null,
            oldBodyHash16,
            newBodyHash16,
            oldBodyLength: oldBodyText.length,
            newBodyLength: newBodyText.length,
            oldSubjectExtracted,
            newSubjectExtracted,
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            editedAt: new Date().toISOString()
          }
        }
      });

      // Step 6: Return response
      return {
        ok: true,
        intervention: 'edit-approval-draft',
        approval_id: approvalId,
        draft_message_id: approval.draftMessageId,
        draft_updated_at: new Date().toISOString(),
        subject_extracted: newSubjectExtracted
      };
    });
  }

  /**
   * Map ApprovalItem to ApprovalSummary (lean list item).
   * @private
   */
  private mapToApprovalSummary(approval: any): ApprovalSummary {
    return {
      id: approval.id,
      tenantId: approval.tenantId,
      status: approval.status,
      requiredRole: approval.requiredRole,
      draftMessageId: approval.draftMessageId,
      runId: approval.runId,
      createdAt: approval.createdAt.toISOString(),
      approvedAt: approval.approvedAt ? approval.approvedAt.toISOString() : null,
      rejectedAt: approval.rejectedAt ? approval.rejectedAt.toISOString() : null
    };
  }

  /**
   * Map ApprovalItem with relations to ApprovalDetail.
   * @private
   */
  private mapToApprovalDetail(approval: any): ApprovalDetail {
    return {
      id: approval.id,
      tenantId: approval.tenantId,
      status: approval.status,
      requiredRole: approval.requiredRole,
      draftMessageId: approval.draftMessageId,
      runId: approval.runId,
      createdAt: approval.createdAt.toISOString(),
      approvedAt: approval.approvedAt ? approval.approvedAt.toISOString() : null,
      approvedByUserId: approval.approvedByUserId,
      rejectedAt: approval.rejectedAt ? approval.rejectedAt.toISOString() : null,
      rejectedReason: approval.rejectedReason,
      draftMessage: {
        id: approval.draftMessage.id,
        reviewId: approval.draftMessage.reviewId,
        customerId: approval.draftMessage.customerId,
        status: approval.draftMessage.status,
        bodyText: approval.draftMessage.bodyText,
        createdAt: approval.draftMessage.createdAt.toISOString(),
        updatedAt: approval.draftMessage.updatedAt.toISOString()
      },
      campaignRun: approval.campaignRun
        ? {
            id: approval.campaignRun.id,
            status: approval.campaignRun.status,
            sendWindowAt: approval.campaignRun.sendWindowAt
              ? approval.campaignRun.sendWindowAt.toISOString()
              : null,
            recipientsTotal: approval.campaignRun.recipientsTotal,
            createdAt: approval.campaignRun.createdAt.toISOString()
          }
        : null
    };
  }

  /**
   * Compute SHA256 hash of text and return as hex string.
   * @private
   */
  private sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Extract subject line from draft body text.
   *
   * Checks if the first line starts with "Subject:" (case-insensitive).
   * If found, returns the text after the prefix.
   * Otherwise, returns null.
   *
   * @private
   */
  private extractSubject(bodyText: string): string | null {
    const firstLine = bodyText.split('\n')[0].trim();
    if (firstLine.toLowerCase().startsWith('subject:')) {
      return firstLine.replace(/^subject:\s*/i, '').trim();
    }
    return null;
  }
}
