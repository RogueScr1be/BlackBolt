import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RevenueController } from './revenue.controller';
import { RevenueService } from './revenue.service';

@Module({
  imports: [PrismaModule, TenancyModule],
  controllers: [RevenueController],
  providers: [RevenueService],
  exports: [RevenueService]
})
export class RevenueModule {}
