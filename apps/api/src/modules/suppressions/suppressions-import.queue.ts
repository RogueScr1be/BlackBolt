import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import {
  SUPPRESSION_IMPORT_IDEMPOTENCY_PREFIX,
  SUPPRESSION_IMPORT_JOB_NAME
} from './suppressions.constants';

export type SuppressionImportJobPayload = {
  tenantId: string;
  suppressionImportId: string;
};

@Injectable()
export class SuppressionsImportQueue {
  constructor(
    @Optional()
    @InjectQueue(QUEUES.SUPPRESSIONS_IMPORT)
    private readonly queue?: Queue<SuppressionImportJobPayload>
  ) {}

  async enqueue(input: SuppressionImportJobPayload) {
    if (!this.queue) {
      throw new ServiceUnavailableException('Suppressions import queue is unavailable');
    }

    const idempotencyKey = `${SUPPRESSION_IMPORT_IDEMPOTENCY_PREFIX}:${input.tenantId}:${input.suppressionImportId}`;

    await this.queue.add(SUPPRESSION_IMPORT_JOB_NAME, input, {
      jobId: input.suppressionImportId,
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
