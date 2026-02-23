import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { OperatorTenantsController } from './operator-tenants.controller';
import { OperatorTenantsService } from './operator-tenants.service';

@Module({
  imports: [PrismaModule, TenancyModule, OperatorCredentialsModule],
  controllers: [OperatorTenantsController],
  providers: [OperatorTenantsService, OperatorKeyGuard]
})
export class OperatorTenantsModule {}
