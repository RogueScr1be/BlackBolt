import { Module } from '@nestjs/common';

import { PrismaModule } from './modules/prisma/prisma.module';
import { QueuesModule } from './modules/queues/queues.module';
import { CustomersWorkerModule } from './modules/customers/customers-worker.module';
import { SuppressionsWorkerModule } from './modules/suppressions/suppressions-worker.module';
import { ReviewsWorkerModule } from './modules/reviews/reviews-worker.module';
import { PostmarkWorkerModule } from './modules/postmark/postmark-worker.module';

@Module({
  imports: [
    PrismaModule,
    QueuesModule,
    CustomersWorkerModule,
    SuppressionsWorkerModule,
    ReviewsWorkerModule,
    PostmarkWorkerModule
  ]
})
export class WorkerModule {}
