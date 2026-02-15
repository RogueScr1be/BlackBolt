import { Module } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenancyService } from './tenancy.service';

@Module({
  providers: [TenantGuard, TenancyService],
  exports: [TenantGuard, TenancyService]
})
export class TenancyModule {}
