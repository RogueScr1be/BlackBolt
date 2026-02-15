import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { POSTMARK_WEBHOOK_JOB_NAME } from './postmark.constants';
import { PostmarkClient } from './postmark.client';
import { PostmarkService } from './postmark.service';
import type { PostmarkReconcileJobPayload } from './postmark.queue';

@Processor(QUEUES.POSTMARK_WEBHOOK_RECONCILE)
export class PostmarkReconcileProcessor extends WorkerHost {
  constructor(
    private readonly postmarkService: PostmarkService,
    private readonly postmarkClient: PostmarkClient
  ) {
    super();
  }

  async process(job: Job<PostmarkReconcileJobPayload>): Promise<void> {
    if (job.name !== POSTMARK_WEBHOOK_JOB_NAME) {
      return;
    }

    await this.postmarkService.reconcileEventById(job.data.webhookEventId, async (providerMessageId) => {
      const resolved = await this.postmarkClient.lookupMessageById(providerMessageId);
      return resolved?.tenantId ?? null;
    });
  }
}
