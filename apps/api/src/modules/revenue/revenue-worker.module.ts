import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { QUEUES } from '../queues/queue.constants';
import { RevenueImportProcessor } from './revenue-import.processor';
import { RevenueModule } from './revenue.module';

@Module({
  imports: [
    PrismaModule,
    QueuesModule,
    RevenueModule,
    BullModule.registerQueue({
      name: QUEUES.REVENUE_IMPORT,
      connection: { url: requireEnv('REDIS_URL') }
    })
  ],
  providers: [RevenueImportProcessor]
})
export class RevenueWorkerModule {}
