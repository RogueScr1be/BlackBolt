import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from '../prisma/prisma.module';
import { QUEUES } from '../queues/queue.constants';
import { PostmarkClient } from './postmark.client';
import { PostmarkMetricsService } from './postmark-metrics.service';
import { PostmarkPolicyService } from './postmark-policy.service';
import { PostmarkReconcileProcessor } from './postmark.processor';
import { PostmarkQueue } from './postmark.queue';
import { PostmarkSendProcessor } from './postmark-send.processor';
import { PostmarkSendQueue } from './postmark-send.queue';
import { PostmarkService } from './postmark.service';
import { PostmarkWebhookLimiterService } from './postmark-webhook-limiter.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: QUEUES.POSTMARK_WEBHOOK_RECONCILE }),
    BullModule.registerQueue({ name: QUEUES.POSTMARK_SEND })
  ],
  providers: [
    PostmarkService,
    PostmarkMetricsService,
    PostmarkWebhookLimiterService,
    PostmarkQueue,
    PostmarkClient,
    PostmarkPolicyService,
    PostmarkSendQueue,
    PostmarkReconcileProcessor,
    PostmarkSendProcessor
  ]
})
export class PostmarkWorkerModule {}
