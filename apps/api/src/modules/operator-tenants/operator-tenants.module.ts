import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorTenantsController } from './operator-tenants.controller';
import { OperatorTenantsService } from './operator-tenants.service';

@Module({
  imports: [PrismaModule, TenancyModule],
  controllers: [OperatorTenantsController],
  providers: [OperatorTenantsService]
})
export class OperatorTenantsModule {}
