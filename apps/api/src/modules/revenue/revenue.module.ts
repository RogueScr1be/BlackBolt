import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { QueuesModule } from '../queues/queues.module';
import { QUEUES } from '../queues/queue.constants';
import { RevenueController } from './revenue.controller';
import { RevenueImportController } from './revenue-import.controller';
import { RevenueImportQueue } from './revenue-import.queue';
import { RevenueImportService } from './revenue-import.service';
import { RevenueService } from './revenue.service';

@Module({
  imports: [
    PrismaModule,
    TenancyModule,
    QueuesModule,
    BullModule.registerQueue({
      name: QUEUES.REVENUE_IMPORT,
      connection: { url: requireEnv('REDIS_URL') }
    })
  ],
  controllers: [RevenueController, RevenueImportController],
  providers: [RevenueService, RevenueImportService, RevenueImportQueue],
  exports: [RevenueService, RevenueImportService]
})
export class RevenueModule {}
