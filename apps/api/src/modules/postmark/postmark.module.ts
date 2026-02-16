import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { QUEUES } from '../queues/queue.constants';
import { PostmarkController } from './postmark.controller';
import { PostmarkService } from './postmark.service';
import { PostmarkQueue } from './postmark.queue';
import { PostmarkClient } from './postmark.client';
import { PostmarkPolicyService } from './postmark-policy.service';
import { PostmarkOpsController } from './postmark-ops.controller';
import { PostmarkOpsService } from './postmark-ops.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PostmarkMetricsService } from './postmark-metrics.service';
import { PostmarkWebhookLimiterService } from './postmark-webhook-limiter.service';

const isWorker = process.env.APP_ROLE === 'worker';
const queueImports = isWorker
  ? [
      BullModule.registerQueue({
        name: QUEUES.POSTMARK_WEBHOOK_RECONCILE,
        connection: { url: requireEnv('REDIS_URL') }
      }),
      BullModule.registerQueue({
        name: QUEUES.POSTMARK_SEND,
        connection: { url: requireEnv('REDIS_URL') }
      })
    ]
  : [];

@Module({
  imports: [
    PrismaModule,
    TenancyModule,
    ...queueImports
  ],
  controllers: [PostmarkController, PostmarkOpsController],
  providers: [
    PostmarkService,
    PostmarkMetricsService,
    PostmarkWebhookLimiterService,
    PostmarkQueue,
    PostmarkClient,
    PostmarkPolicyService,
    PostmarkOpsService
  ],
  exports: [PostmarkService, PostmarkOpsService]
})
export class PostmarkModule {}
