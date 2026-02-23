import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { REVENUE_IMPORT_IDEMPOTENCY_PREFIX, REVENUE_IMPORT_JOB_NAME } from './revenue-import.constants';

export type RevenueImportJobPayload = {
  tenantId: string;
  revenueImportId: string;
};

@Injectable()
export class RevenueImportQueue {
  constructor(
    @Optional()
    @InjectQueue(QUEUES.REVENUE_IMPORT)
    private readonly queue?: Queue<RevenueImportJobPayload>
  ) {}

  async enqueue(input: RevenueImportJobPayload) {
    if (!this.queue) {
      throw new ServiceUnavailableException('Revenue import queue is unavailable');
    }

    const idempotencyKey = `${REVENUE_IMPORT_IDEMPOTENCY_PREFIX}:${input.tenantId}:${input.revenueImportId}`;
    await this.queue.add(REVENUE_IMPORT_JOB_NAME, input, {
      jobId: input.revenueImportId,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: false,
      removeOnFail: false
    });

    return { idempotencyKey };
  }
}
