import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { requireEnv } from '../../runtime/env';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { QUEUES } from '../queues/queue.constants';
import { CustomersController } from './customers.controller';
import { CustomersImportsStatusController } from './customers-imports-status.controller';
import { CustomersImportService } from './customers-import.service';
import { CustomersImportQueue } from './customers-import.queue';
import { CustomersService } from './customers.service';

const isWorker = process.env.APP_ROLE === 'worker';
const queueImports = isWorker
  ? [
      BullModule.registerQueue({
        name: QUEUES.CUSTOMERS_IMPORT,
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
  controllers: [CustomersController, CustomersImportsStatusController],
  providers: [CustomersImportService, CustomersImportQueue, CustomersService],
  exports: [CustomersService]
})
export class CustomersModule {}
