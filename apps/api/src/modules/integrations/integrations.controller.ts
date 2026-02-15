import { Body, Controller, Get, Patch, Param, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { IntegrationsService } from './integrations.service';

@Controller('v1/tenants/:tenantId/integrations')
@UseGuards(TenantGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Patch('gbp')
  async setGbpIntegration(
    @Param('tenantId') tenantId: string,
    @Req() req: RequestWithContext,
    @Body()
    body: {
      gbpAccountId: string;
      gbpLocationId: string;
      gbpAccessTokenRef: string;
      reason?: string;
    }
  ) {
    return this.integrationsService.setGbpIntegration({
      tenantId,
      actorUserId: req.userId ?? null,
      gbpAccountId: body.gbpAccountId,
      gbpLocationId: body.gbpLocationId,
      gbpAccessTokenRef: body.gbpAccessTokenRef,
      reason: body.reason
    });
  }

  @Get('gbp/operator-summary')
  async getGbpOperatorSummary(@Param('tenantId') tenantId: string) {
    return this.integrationsService.getGbpOperatorSummary({ tenantId });
  }
}
