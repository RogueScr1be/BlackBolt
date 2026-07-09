import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { PortfolioOperatorGuard } from '../../common/guards/portfolio-operator.guard';
import { OperatorPortfolioService } from './operator-portfolio.service';
import { ReviewOperatorActionsService, type ReviewOperatorActionStatus } from './review-operator-actions.service';

type PatchApprovalDraftBody = {
  subject?: string;
  body?: string;
  segment?: string;
  send_window_at?: string;
};

type RejectApprovalBody = {
  reason?: string;
};

type CreateReviewOperatorActionBody = {
  tenant_id: string;
  review_id: string;
};

type UpdateReviewOperatorActionBody = {
  status: ReviewOperatorActionStatus;
};

@Controller('v1/operator')
@UseGuards(PortfolioOperatorGuard)
export class OperatorPortfolioController {
  constructor(
    private readonly portfolio: OperatorPortfolioService,
    private readonly reviewOperatorActions: ReviewOperatorActionsService
  ) {}

  @Get('portfolio/tenants')
  async listPortfolioTenants(@Req() req: RequestWithContext) {
    return this.portfolio.listPortfolioTenants(req.operatorTenantIds ?? []);
  }

  @Get('reviews/queue')
  async listReviewQueue(
    @Req() req: RequestWithContext,
    @Query('state') state?: string,
    @Query('since') since?: string,
    @Query('tenant_id') tenantId?: string
  ) {
    return this.portfolio.listReviewQueue({
      allowedTenantIds: req.operatorTenantIds ?? [],
      tenantId,
      state,
      since
    });
  }

  @Get('approvals')
  async listApprovals(
    @Req() req: RequestWithContext,
    @Query('state') state?: string,
    @Query('tenant_id') tenantId?: string
  ) {
    return this.portfolio.listApprovals({
      allowedTenantIds: req.operatorTenantIds ?? [],
      tenantId,
      state
    });
  }

  @Get('approvals/:approvalId')
  async getApproval(@Req() req: RequestWithContext, @Param('approvalId') approvalId: string) {
    return this.portfolio.getApproval({
      allowedTenantIds: req.operatorTenantIds ?? [],
      approvalId
    });
  }

  @Patch('approvals/:approvalId/draft')
  async patchApprovalDraft(
    @Req() req: RequestWithContext,
    @Param('approvalId') approvalId: string,
    @Body() body: PatchApprovalDraftBody
  ) {
    return this.portfolio.patchApprovalDraft({
      allowedTenantIds: req.operatorTenantIds ?? [],
      approvalId,
      actorUserId: req.userId ?? null,
      subject: body.subject,
      body: body.body,
      segment: body.segment,
      sendWindowAt: body.send_window_at
    });
  }

  @Post('approvals/:approvalId/approve')
  async approveApproval(@Req() req: RequestWithContext, @Param('approvalId') approvalId: string) {
    return this.portfolio.approveApproval({
      allowedTenantIds: req.operatorTenantIds ?? [],
      approvalId,
      actorUserId: req.userId ?? null
    });
  }

  @Post('approvals/:approvalId/reject')
  async rejectApproval(
    @Req() req: RequestWithContext,
    @Param('approvalId') approvalId: string,
    @Body() body: RejectApprovalBody
  ) {
    return this.portfolio.rejectApproval({
      allowedTenantIds: req.operatorTenantIds ?? [],
      approvalId,
      actorUserId: req.userId ?? null,
      reason: body.reason
    });
  }

  @Post('reviews/:reviewId/reactivation-runs')
  async retriggerRun(
    @Req() req: RequestWithContext,
    @Param('reviewId') reviewId: string,
    @Body() body: { tenant_id?: string } = {}
  ) {
    return this.portfolio.retriggerReactivationRun({
      allowedTenantIds: req.operatorTenantIds ?? [],
      reviewId,
      tenantId: body.tenant_id,
      actorUserId: req.userId ?? null
    });
  }

  @Get('review-actions')
  async listReviewActions(
    @Req() req: RequestWithContext,
    @Query('status') status?: string,
    @Query('tenant_id') tenantId?: string
  ) {
    return this.reviewOperatorActions.listReviewOperatorActions({
      allowedTenantIds: req.operatorTenantIds ?? [],
      tenantId,
      status
    });
  }

  @Post('review-actions/public-reply-suggestion')
  async createReviewAction(@Req() req: RequestWithContext, @Body() body: CreateReviewOperatorActionBody) {
    return this.reviewOperatorActions.createPublicReplySuggestion({
      allowedTenantIds: req.operatorTenantIds ?? [],
      tenantId: body.tenant_id,
      reviewId: body.review_id,
      actorUserId: req.userId ?? null
    });
  }

  @Patch('review-actions/:actionId')
  async updateReviewAction(
    @Req() req: RequestWithContext,
    @Param('actionId') actionId: string,
    @Body() body: UpdateReviewOperatorActionBody
  ) {
    return this.reviewOperatorActions.updateReviewOperatorAction({
      allowedTenantIds: req.operatorTenantIds ?? [],
      actionId,
      status: body.status,
      actorUserId: req.userId ?? null
    });
  }
}
