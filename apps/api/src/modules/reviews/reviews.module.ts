import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { GbpModule } from '../gbp/gbp.module';
import { QUEUES } from '../queues/queue.constants';
import { ReviewsController } from './reviews.controller';
import { ReviewsQueue } from './reviews.queue';
import { ReviewsService } from './reviews.service';

const isWorker = process.env.APP_ROLE === 'worker';
const queueImports = isWorker ? [BullModule.registerQueue({ name: QUEUES.GBP_INGEST })] : [];

@Module({
  imports: [
    PrismaModule,
    QueuesModule,
    TenancyModule,
    GbpModule,
    ...queueImports
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsQueue]
})
export class ReviewsModule {}
