import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { QUEUES } from '../queues/queue.constants';
import { POSTMARK_WEBHOOK_JOB_NAME } from './postmark.constants';

export type PostmarkReconcileJobPayload = {
  webhookEventId: string;
  providerMessageId: string;
};

@Injectable()
export class PostmarkQueue {
  constructor(
    @Optional()
    @InjectQueue(QUEUES.POSTMARK_WEBHOOK_RECONCILE)
    private readonly queue?: Queue<PostmarkReconcileJobPayload>
  ) {}

  async enqueueReconcile(input: PostmarkReconcileJobPayload) {
    if (!this.queue) {
      throw new ServiceUnavailableException('Postmark reconcile queue is unavailable');
    }

    const key = createHash('sha256').update(`${input.webhookEventId}:${input.providerMessageId}`).digest('hex').slice(0, 24);
    const jobId = `postmark-reconcile:${key}`;

    const job = await this.queue.add(POSTMARK_WEBHOOK_JOB_NAME, input, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false
    });

    return { jobId: String(job.id) };
  }
}
