import { Controller, Get, NotImplementedException, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('v1/tenants')
export class TenantsController {
  @Get()
  @UseGuards(TenantGuard)
  listTenants() {
    throw new NotImplementedException({
      error: 'not_implemented',
      message: 'Tenants endpoint not implemented in Phase 1 skeleton'
    });
  }
}
