import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(@Req() req: RequestWithContext) {
    return this.dashboardService.getSummary(req.tenantId!);
  }
}
