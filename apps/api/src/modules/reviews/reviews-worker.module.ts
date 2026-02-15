import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { GbpModule } from '../gbp/gbp.module';
import { QUEUES } from '../queues/queue.constants';
import { ReviewsProcessor } from './reviews.processor';
import { ReviewsQueue } from './reviews.queue';

@Module({
  imports: [PrismaModule, QueuesModule, GbpModule, BullModule.registerQueue({ name: QUEUES.GBP_INGEST })],
  providers: [ReviewsQueue, ReviewsProcessor]
})
export class ReviewsWorkerModule {}
