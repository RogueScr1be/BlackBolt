import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { QUEUES } from '../queues/queue.constants';
import { CustomersImportProcessor } from './customers-import.processor';

@Module({
  imports: [PrismaModule, QueuesModule, BullModule.registerQueue({ name: QUEUES.CUSTOMERS_IMPORT })],
  providers: [CustomersImportProcessor]
})
export class CustomersWorkerModule {}
