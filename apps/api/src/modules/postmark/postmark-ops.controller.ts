import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PostmarkOpsService } from './postmark-ops.service';

@Controller('v1/tenants/:tenantId/integrations/postmark')
@UseGuards(TenantGuard)
export class PostmarkOpsController {
  constructor(private readonly opsService: PostmarkOpsService) {}

  @Get('operator-summary')
  async getOperatorSummary(@Param('tenantId') tenantId: string) {
    return this.opsService.getOperatorSummary(tenantId);
  }

  @Post('resume')
  async resume(
    @Param('tenantId') tenantId: string,
    @Req() req: RequestWithContext,
    @Body() body: { checklistAck?: boolean }
  ) {
    if (!body.checklistAck) {
      return {
        resumed: false,
        reason: 'checklistAck must be true',
        blockingReasons: ['checklistAck must be true'],
        pausedBefore: false,
        pausedAfter: false,
        resumeChecklistAck: false,
        resumeChecklistAckActor: null,
        resumeChecklistAckAt: null,
        requeuedMessageCount: 0
      };
    }

    const actor = req.userId ?? 'system';
    return this.opsService.ackAndResume(tenantId, actor, {
      action: 'POSTMARK_CONTROL_PLANE_RESUME',
      entityType: 'postmark.send_control',
      actorUserId: req.userId ?? actor,
      surface: 'integrations/postmark/resume'
    });
  }
}
