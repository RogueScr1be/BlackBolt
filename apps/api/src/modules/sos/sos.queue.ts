import { createHash } from 'node:crypto';
import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { SOS_CASE_ORCHESTRATION_JOB_NAME } from './sos.constants';

export type SosCaseCreateJobPayload = {
  tenantId: string;
  paymentIntentId: string;
  webhookEventId: string;
  idempotencyKey: string;
};

function toBullJobId(idempotencyKey: string): string {
  return `sos-case-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)}`;
}

@Injectable()
export class SosQueue {
  constructor(
    @Optional()
    @InjectQueue(QUEUES.SOS_CASE_ORCHESTRATION)
    private readonly queue?: Queue<SosCaseCreateJobPayload>
  ) {}

  async enqueueCaseCreate(input: SosCaseCreateJobPayload) {
    if (!this.queue) {
      throw new ServiceUnavailableException('SOS case orchestration queue is unavailable');
    }

    const job = await this.queue.add(SOS_CASE_ORCHESTRATION_JOB_NAME, input, {
      jobId: toBullJobId(input.idempotencyKey),
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 3_000
      },
      removeOnComplete: false,
      removeOnFail: false
    });

    return { jobId: String(job.id), idempotencyKey: input.idempotencyKey };
  }
}
