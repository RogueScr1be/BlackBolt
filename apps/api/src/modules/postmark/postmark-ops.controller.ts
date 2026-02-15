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
      return { resumed: false, reason: 'checklistAck must be true' };
    }

    const actor = req.userId ?? 'system';
    return this.opsService.ackAndResume(tenantId, actor);
  }
}
