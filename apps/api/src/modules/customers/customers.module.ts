import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { TenancyModule } from '../tenancy/tenancy.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { QUEUES } from '../queues/queue.constants';
import { CustomersController } from './customers.controller';
import { CustomersImportsStatusController } from './customers-imports-status.controller';
import { CustomersImportService } from './customers-import.service';
import { CustomersImportQueue } from './customers-import.queue';
import { CustomersService } from './customers.service';

@Module({
  imports: [
    TenancyModule,
    PrismaModule,
    QueuesModule,
    BullModule.registerQueue({ name: QUEUES.CUSTOMERS_IMPORT })
  ],
  controllers: [CustomersController, CustomersImportsStatusController],
  providers: [CustomersImportService, CustomersImportQueue, CustomersService],
  exports: [CustomersService]
})
export class CustomersModule {}
