import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { BootstrapService } from './bootstrap.service';

@Controller('v1/bootstrap')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Get('status')
  async getStatus(@Req() req: RequestWithContext) {
    return this.bootstrapService.getStatus(req.tenantId!);
  }
}
