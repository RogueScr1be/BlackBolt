import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  async listAlerts(@Req() req: RequestWithContext, @Query('state') state?: string) {
    return this.alertsService.listAlerts({
      tenantId: req.tenantId!,
      state: state === 'all' ? 'all' : 'open'
    });
  }
}
