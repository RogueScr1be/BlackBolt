import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { QUEUES } from '../queues/queue.constants';
import {
  GBP_INGEST_IDEMPOTENCY_PREFIX,
  GBP_INGEST_IDEMPOTENCY_VERSION,
  GBP_PAGE_FETCH_JOB_NAME,
  GBP_POLL_TRIGGER_JOB_NAME
} from './reviews.constants';

export type GbpPollTriggerJobPayload = {
  tenantId: string;
  locationId: string;
  timeBucket: string;
};

export type GbpPageFetchJobPayload = {
  tenantId: string;
  locationId: string;
  cursor: string | null;
  pagesRemaining: number;
  deadlineAtEpochMs: number;
};

@Injectable()
export class ReviewsQueue {
  constructor(
    @Optional()
    @InjectQueue(QUEUES.GBP_INGEST)
    private readonly queue?: Queue<GbpPollTriggerJobPayload | GbpPageFetchJobPayload>
  ) {}

  async enqueuePollTrigger(input: { tenantId: string; locationId: string }) {
    if (!this.queue) {
      throw new ServiceUnavailableException('GBP ingest queue is unavailable');
    }

    const timeBucket = new Date().toISOString().slice(0, 13);
    const idempotencyKey = `${GBP_INGEST_IDEMPOTENCY_PREFIX}:${input.tenantId}:${input.locationId}:${timeBucket}`;

    const job = await this.queue.add(
      GBP_POLL_TRIGGER_JOB_NAME,
      {
        tenantId: input.tenantId,
        locationId: input.locationId,
        timeBucket
      },
      {
        jobId: idempotencyKey,
        delay: Math.floor(Math.random() * 1000),
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000
        },
        removeOnComplete: false,
        removeOnFail: false
      }
    );

    return { idempotencyKey, jobId: String(job.id) };
  }

  async enqueuePageFetch(input: {
    tenantId: string;
    locationId: string;
    cursor: string | null;
    pagesRemaining: number;
    deadlineAtEpochMs: number;
  }) {
    if (!this.queue) {
      throw new ServiceUnavailableException('GBP ingest queue is unavailable');
    }

    const cursorHash = this.hashCursor(input.cursor);
    const idempotencyKey =
      `${GBP_INGEST_IDEMPOTENCY_PREFIX}:${input.tenantId}:${input.locationId}:${cursorHash}:${GBP_INGEST_IDEMPOTENCY_VERSION}`;

    const job = await this.queue.add(
      GBP_PAGE_FETCH_JOB_NAME,
      {
        tenantId: input.tenantId,
        locationId: input.locationId,
        cursor: input.cursor,
        pagesRemaining: input.pagesRemaining,
        deadlineAtEpochMs: input.deadlineAtEpochMs
      },
      {
        jobId: idempotencyKey,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000
        },
        removeOnComplete: false,
        removeOnFail: false
      }
    );

    return { idempotencyKey, jobId: String(job.id), cursorHash };
  }

  private hashCursor(cursor: string | null): string {
    return createHash('sha256').update(cursor ?? 'START_CURSOR').digest('hex').slice(0, 16);
  }
}
