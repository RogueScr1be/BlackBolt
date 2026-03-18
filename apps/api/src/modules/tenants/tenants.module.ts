import { Module } from '@nestjs/common';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { TenantsController } from './tenants.controller';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorTenantsModule } from '../operator-tenants/operator-tenants.module';

@Module({
  imports: [TenancyModule, OperatorCredentialsModule, OperatorTenantsModule],
  controllers: [TenantsController],
  providers: [OperatorKeyGuard]
})
export class TenantsModule {}
