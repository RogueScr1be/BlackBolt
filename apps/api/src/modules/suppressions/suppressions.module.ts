import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { requireEnv } from '../../runtime/env';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { QUEUES } from '../queues/queue.constants';
import { SuppressionsController } from './suppressions.controller';
import { SuppressionsImportService } from './suppressions-import.service';
import { SuppressionsImportQueue } from './suppressions-import.queue';

const isWorker = process.env.APP_ROLE === 'worker';
const queueImports = isWorker
  ? [
      BullModule.registerQueue({
        name: QUEUES.SUPPRESSIONS_IMPORT,
        connection: { url: requireEnv('REDIS_URL') }
      })
    ]
  : [];

@Module({
  imports: [
    TenancyModule,
    PrismaModule,
    QueuesModule,
    ...queueImports
  ],
  controllers: [SuppressionsController],
  providers: [SuppressionsImportService, SuppressionsImportQueue]
})
export class SuppressionsModule {}
