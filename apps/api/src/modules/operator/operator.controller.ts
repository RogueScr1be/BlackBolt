import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { OperatorService } from './operator.service';

@Controller('v1/tenants/:tenantId')
@UseGuards(TenantGuard)
export class OperatorController {
  constructor(private readonly operatorService: OperatorService) {}

  @Get('operator/command-center')
  async getCommandCenter(@Param('tenantId') tenantId: string) {
    return this.operatorService.getCommandCenter(tenantId);
  }

  @Post('interventions/retry-gbp-ingestion')
  async retryGbpIngestion(@Param('tenantId') tenantId: string, @Req() req: RequestWithContext) {
    return this.operatorService.retryGbpIngestion(tenantId, req.userId ?? null);
  }

  @Post('interventions/resume-postmark')
  async resumePostmark(@Param('tenantId') tenantId: string, @Req() req: RequestWithContext) {
    return this.operatorService.resumePostmark(tenantId, req.userId ?? null);
  }

  @Post('interventions/ack-alert')
  async ackAlert(
    @Param('tenantId') tenantId: string,
    @Req() req: RequestWithContext,
    @Body() body: { alert_id: string }
  ) {
    return this.operatorService.ackAlert({
      tenantId,
      alertId: body.alert_id,
      actorUserId: req.userId ?? null
    });
  }

  @Get('reports/monthly')
  async getMonthlyReport(@Param('tenantId') tenantId: string, @Query('month') month?: string) {
    const effectiveMonth = month ?? new Date().toISOString().slice(0, 7);
    return this.operatorService.getMonthlyReport(tenantId, effectiveMonth);
  }
}
