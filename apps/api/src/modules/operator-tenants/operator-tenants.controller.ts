import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { OperatorTenantsService } from './operator-tenants.service';

@Controller('tenants')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class OperatorTenantsController {
  constructor(private readonly tenantsService: OperatorTenantsService) {}

  @Get()
  async listTenants(@Req() req: RequestWithContext) {
    return this.tenantsService.listTenants(req.tenantId!);
  }

  @Get(':tenantId')
  async getTenant(@Req() req: RequestWithContext, @Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenant(req.tenantId!, tenantId);
  }

  @Get(':tenantId/metrics')
  async getMetrics(
    @Req() req: RequestWithContext,
    @Param('tenantId') tenantId: string,
    @Query('range') range?: string
  ) {
    const normalized = (range ?? '30d') as '30d' | '90d' | 'ytd';
    if (!['30d', '90d', 'ytd'].includes(normalized)) {
      throw new BadRequestException('range must be 30d, 90d, or ytd');
    }

    return this.tenantsService.getTenantMetrics(req.tenantId!, tenantId, normalized);
  }
}
