import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { DashboardService } from './dashboard.service';

@Controller('v1/tenants/:tenantId/dashboard')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class DashboardV1Controller {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(@Req() req: RequestWithContext) {
    return this.dashboardService.getSummary(req.tenantId!);
  }
}
