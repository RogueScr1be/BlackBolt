import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CustomersService } from './customers.service';

@Controller('v1/imports')
@UseGuards(TenantGuard)
export class CustomersImportsStatusController {
  constructor(private readonly customersService: CustomersService) {}

  @Get(':importId')
  async getImportStatus(@Param('importId') importId: string, @Req() req: RequestWithContext) {
    return this.customersService.getCustomerImportStatus(req.tenantId!, importId);
  }
}
