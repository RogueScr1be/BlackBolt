import { Injectable, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { QUEUES } from '../queues/queue.constants';
import {
  GBP_INGEST_IDEMPOTENCY_PREFIX,
  GBP_INGEST_IDEMPOTENCY_VERSION,
  GBP_PAGE_FETCH_JOB_NAME,
  GBP_POLL_INTERVAL_DEFAULT_MS,
  GBP_POLL_SCHEDULER_JOB_ID,
  GBP_POLL_SCHEDULER_JOB_NAME,
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
export class ReviewsQueue implements OnModuleInit {
  constructor(
    @Optional()
    @InjectQueue(QUEUES.GBP_INGEST)
    private readonly queue?: Queue<GbpPollTriggerJobPayload | GbpPageFetchJobPayload>
  ) {}

  async onModuleInit() {
    if (!this.queue) {
      return;
    }
    await this.schedulePoller();
  }

  async enqueuePollTrigger(input: { tenantId: string; locationId: string; timeBucket?: string; delayMs?: number }) {
    if (!this.queue) {
      throw new ServiceUnavailableException('GBP ingest queue is unavailable');
    }

    const timeBucket = input.timeBucket ?? new Date().toISOString().slice(0, 13);
    const idempotencyKey = `${GBP_INGEST_IDEMPOTENCY_PREFIX}:${input.tenantId}:${input.locationId}:${timeBucket}`;
    const jobId = this.buildBullJobId(GBP_POLL_TRIGGER_JOB_NAME, idempotencyKey);

    const job = await this.queue.add(
      GBP_POLL_TRIGGER_JOB_NAME,
      {
        tenantId: input.tenantId,
        locationId: input.locationId,
        timeBucket
      },
      {
        jobId,
        delay: input.delayMs ?? Math.floor(Math.random() * 1000),
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

  async enqueueSchedulerTick() {
    if (!this.queue) {
      throw new ServiceUnavailableException('GBP ingest queue is unavailable');
    }

    const tickAt = new Date().toISOString();
    const jobId = this.buildBullJobId(GBP_POLL_SCHEDULER_JOB_NAME, tickAt);
    const job = await this.queue.add(
      GBP_POLL_SCHEDULER_JOB_NAME,
      {
        tenantId: 'scheduler',
        locationId: 'scheduler',
        timeBucket: tickAt
      },
      {
        jobId,
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    return { jobId: String(job.id) };
  }

  private async schedulePoller() {
    if (!this.queue || process.env.GBP_POLL_SCHEDULER_DISABLED === '1') {
      return;
    }

    const intervalMs = Number.parseInt(process.env.GBP_POLL_INTERVAL_MS ?? `${GBP_POLL_INTERVAL_DEFAULT_MS}`, 10);
    if (!Number.isFinite(intervalMs) || intervalMs < 60_000) {
      throw new Error('GBP_POLL_INTERVAL_MS must be >= 60000');
    }

    await this.queue.add(
      GBP_POLL_SCHEDULER_JOB_NAME,
      {
        tenantId: 'scheduler',
        locationId: 'scheduler',
        timeBucket: new Date().toISOString()
      },
      {
        jobId: GBP_POLL_SCHEDULER_JOB_ID,
        repeat: { every: intervalMs },
        removeOnComplete: true,
        removeOnFail: false
      }
    );
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
    const jobId = this.buildBullJobId(GBP_PAGE_FETCH_JOB_NAME, idempotencyKey);

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
        jobId,
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

  private buildBullJobId(jobName: string, idempotencyKey: string): string {
    const digest = createHash('sha256').update(idempotencyKey).digest('hex');
    return `${jobName}-${digest}`;
  }
}
