import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { GbpModule } from '../gbp/gbp.module';
import { QUEUES } from '../queues/queue.constants';
import { ReviewsController } from './reviews.controller';
import { ReviewsQueue } from './reviews.queue';
import { ReviewsService } from './reviews.service';

const queueImports = [
  BullModule.registerQueue({
    name: QUEUES.GBP_INGEST,
    connection: { url: requireEnv('REDIS_URL') }
  })
];

@Module({
  imports: [
    PrismaModule,
    QueuesModule,
    TenancyModule,
    GbpModule,
    ...queueImports
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsQueue],
  exports: [ReviewsService]
})
export class ReviewsModule {}
