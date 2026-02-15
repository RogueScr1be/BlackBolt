import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { QUEUES } from '../queues/queue.constants';
import { SuppressionsImportProcessor } from './suppressions-import.processor';

@Module({
  imports: [PrismaModule, QueuesModule, BullModule.registerQueue({ name: QUEUES.SUPPRESSIONS_IMPORT })],
  providers: [SuppressionsImportProcessor]
})
export class SuppressionsWorkerModule {}
