import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenancyModule } from '../tenancy/tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [TenantsController]
})
export class TenantsModule {}
