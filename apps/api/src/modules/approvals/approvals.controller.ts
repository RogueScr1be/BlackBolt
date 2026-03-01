import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ApprovalsService } from './approvals.service';
import type { ApprovalDraftEditRequest } from './approvals.types';

/**
 * ApprovalsController
 * Tenant-scoped endpoints for managing approval items
 *
 * All endpoints require:
 * - OperatorKeyGuard: validates x-operator-key header
 * - TenantGuard: enforces tenantId param matches x-tenant-id header
 */
@Controller('v1/tenants/:tenantId/approvals')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  /**
   * Get paginated list of approval items.
   *
   * Supports cursor-based pagination and optional filtering by status and runId.
   *
   * @param tenantId - Tenant ID from route parameter
   * @param limit - Number of items to return (default: 50, clamped to 1-200)
   * @param cursor - Pagination cursor for the next page (optional)
   * @param status - Filter by status (optional, case-insensitive: 'queued' | 'approved' | 'rejected')
   * @param runId - Filter by campaign run ID (optional)
   */
  @Get()
  async getApprovals(
    @Param('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string,
    @Query('runId') runId?: string
  ) {
    return this.approvalsService.getApprovals({
      tenantId,
      limit: Math.max(1, Math.min(limit, 200)),
      cursor,
      status,
      runId
    });
  }

  /**
   * Get full approval item detail.
   *
   * Includes draftMessage with bodyText and campaignRun (if present).
   *
   * @param tenantId - Tenant ID from route parameter
   * @param approvalId - Approval item ID from route parameter
   */
  @Get(':approvalId')
  async getApprovalDetail(
    @Param('tenantId') tenantId: string,
    @Param('approvalId') approvalId: string
  ) {
    return this.approvalsService.getApprovalDetail(tenantId, approvalId);
  }

  /**
   * Approve an approval item.
   *
   * Validates that the approval is in 'queued' status.
   * Request body is optional and reserved for future use.
   *
   * Note: Releases ONLY the tied CampaignMessage (Agent 3 implementation).
   *
   * @param tenantId - Tenant ID from route parameter
   * @param approvalId - Approval item ID from route parameter
   * @param req - Request context with userId
   */
  @Post(':approvalId/approve')
  async approveApprovalItem(
    @Param('tenantId') tenantId: string,
    @Param('approvalId') approvalId: string,
    @Req() req: RequestWithContext
  ) {
    return await this.approvalsService.approveApprovalItem(
      tenantId,
      approvalId,
      req.userId // Operator user ID from request context
    );
  }

  /**
   * Reject an approval item.
   *
   * Validates that the approval is in 'queued' status.
   * Request body may include an optional rejection reason.
   *
   * Note: Actual state change is implemented (Agent 3).
   *
   * @param tenantId - Tenant ID from route parameter
   * @param approvalId - Approval item ID from route parameter
   * @param body - Request body with optional reason
   * @param req - Request context with userId
   */
  @Post(':approvalId/reject')
  async rejectApprovalItem(
    @Param('tenantId') tenantId: string,
    @Param('approvalId') approvalId: string,
    @Body() body?: { reason?: string },
    @Req() req?: RequestWithContext
  ) {
    return await this.approvalsService.rejectApprovalItem(
      tenantId,
      approvalId,
      body?.reason
    );
  }

  /**
   * Edit approval draft.
   *
   * Allows operators to modify the draft message body and content for a queued approval.
   *
   * Validation:
   * - bodyText must be non-empty after trim
   * - bodyText must start with "Subject:" (case-insensitive)
   * - expectedUpdatedAt must be a valid ISO8601 date string
   *
   * Error responses:
   * - 400 BadRequestException: Invalid input (empty body, missing Subject, invalid date)
   * - 404 NotFoundException: Approval item not found
   * - 409 ConflictException: Approval not queued, message not PAUSED, already sent, or optimistic lock conflict
   *
   * @param tenantId - Tenant ID from route parameter
   * @param approvalId - Approval item ID from route parameter
   * @param body - Request body with new draft content and optimistic lock timestamp
   * @param req - Request context with userId
   * @returns ApprovalDraftEditResponse
   */
  @Post(':approvalId/draft')
  async editApprovalDraft(
    @Param('tenantId') tenantId: string,
    @Param('approvalId') approvalId: string,
    @Body() body: ApprovalDraftEditRequest,
    @Req() req: RequestWithContext
  ) {
    // Validate bodyText is non-empty after trim
    const trimmedBodyText = body.bodyText.trim();
    if (!trimmedBodyText) {
      throw new BadRequestException('Draft body must not be empty');
    }

    // Validate bodyText starts with "Subject:" (case-insensitive)
    if (!trimmedBodyText.toLowerCase().startsWith('subject:')) {
      throw new BadRequestException("Draft body must start with 'Subject: <subject>' line");
    }

    // Validate expectedUpdatedAt is a valid ISO8601 date
    const parsedDate = new Date(body.expectedUpdatedAt);
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException('expectedUpdatedAt must be a valid ISO8601 date');
    }

    // Delegate to service
    return await this.approvalsService.editApprovalDraft(
      tenantId,
      approvalId,
      trimmedBodyText,
      parsedDate,
      req.userId
    );
  }
}
