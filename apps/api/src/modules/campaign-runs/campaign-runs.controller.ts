import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { CampaignRunsService } from './campaign-runs.service';

@Controller('v1/tenants/:tenantId/campaign-runs')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class CampaignRunsController {
  constructor(private readonly runs: CampaignRunsService) {}

  @Get()
  async listRuns(
    @Param('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number
  ) {
    return this.runs.listRuns(tenantId, limit);
  }

  @Get(':runId')
  async getRun(@Param('tenantId') tenantId: string, @Param('runId') runId: string) {
    return this.runs.getRun(tenantId, runId);
  }

  @Post(':runId/pause')
  async pauseRun(@Param('tenantId') tenantId: string, @Param('runId') runId: string, @Req() req: RequestWithContext) {
    return this.runs.pauseRun(tenantId, runId, req.userId ?? null);
  }

  @Post(':runId/resume')
  async resumeRun(@Param('tenantId') tenantId: string, @Param('runId') runId: string, @Req() req: RequestWithContext) {
    return this.runs.resumeRun(tenantId, runId, req.userId ?? null);
  }
}
