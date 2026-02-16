import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { CUSTOMER_IMPORT_JOB_NAME, CUSTOMER_IMPORT_IDEMPOTENCY_PREFIX } from './customers.constants';

export type CustomerImportJobPayload = {
  tenantId: string;
  importId: string;
};

@Injectable()
export class CustomersImportQueue {
  constructor(
    @Optional()
    @InjectQueue(QUEUES.CUSTOMERS_IMPORT)
    private readonly queue?: Queue<CustomerImportJobPayload>
  ) {}

  async enqueue(input: CustomerImportJobPayload) {
    if (!this.queue) {
      throw new ServiceUnavailableException('Customers import queue is unavailable');
    }

    const idempotencyKey = `${CUSTOMER_IMPORT_IDEMPOTENCY_PREFIX}:${input.tenantId}:${input.importId}`;

    await this.queue.add(CUSTOMER_IMPORT_JOB_NAME, input, {
      jobId: input.importId,
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
