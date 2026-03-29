import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { OperatorService } from './operator.service';

@Controller('v1/tenants/:tenantId')
@UseGuards(OperatorKeyGuard, TenantGuard)
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

  @Post('interventions/prepare-postmark-resume-fixture')
  async preparePostmarkResumeFixture(@Param('tenantId') tenantId: string, @Req() req: RequestWithContext) {
    return this.operatorService.preparePostmarkResumeFixture(tenantId, req.userId ?? null);
  }

  @Post('interventions/cleanup-postmark-resume-fixture')
  async cleanupPostmarkResumeFixture(@Param('tenantId') tenantId: string, @Req() req: RequestWithContext) {
    return this.operatorService.cleanupPostmarkResumeFixture(tenantId, req.userId ?? null);
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

  @Post('operator/smoke')
  async smoke(@Param('tenantId') tenantId: string, @Req() req: RequestWithContext) {
    return this.operatorService.runSmokeChecks({
      tenantId,
      headers: req.headers
    });
  }

  @Post('operator/keys/rotate')
  async rotateOperatorKey(@Param('tenantId') tenantId: string, @Req() req: RequestWithContext) {
    return this.operatorService.rotateOperatorKey(tenantId, req.userId ?? null);
  }
}
