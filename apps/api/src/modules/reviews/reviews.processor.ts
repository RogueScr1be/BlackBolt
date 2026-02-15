import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { JobRunLedgerService } from '../queues/job-run-ledger.service';
import { QUEUES } from '../queues/queue.constants';
import { GbpClient } from '../gbp/gbp.client';
import { GBP_SOURCE, GbpPermanentAuthError } from '../gbp/gbp.constants';
import {
  GBP_INGEST_IDEMPOTENCY_PREFIX,
  GBP_INGEST_IDEMPOTENCY_VERSION,
  GBP_PAGE_FETCH_JOB_NAME,
  GBP_POLL_TRIGGER_JOB_NAME
} from './reviews.constants';
import type { GbpPageFetchJobPayload, GbpPollTriggerJobPayload } from './reviews.queue';
import { ReviewsQueue } from './reviews.queue';

type GbpJobPayload = GbpPollTriggerJobPayload | GbpPageFetchJobPayload;
type Telemetry = {
  pages_fetched: number;
  reviews_fetched: number;
  upserted: number;
  skipped: number;
  cooldown_applied: boolean;
  error_class: string | null;
};

@Processor(QUEUES.GBP_INGEST)
export class ReviewsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewsProcessor.name);
  private readonly maxPagesPerRun = 5;
  private readonly maxRunMs = 45_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: JobRunLedgerService,
    private readonly gbpClient: GbpClient,
    private readonly reviewsQueue: ReviewsQueue
  ) {
    super();
  }

  async process(job: Job<GbpJobPayload>): Promise<void> {
    if (job.name === GBP_POLL_TRIGGER_JOB_NAME) {
      await this.processPollTrigger(job as Job<GbpPollTriggerJobPayload>);
      return;
    }

    if (job.name === GBP_PAGE_FETCH_JOB_NAME) {
      await this.processPageFetch(job as Job<GbpPageFetchJobPayload>);
      return;
    }

    this.logger.warn(`Unknown GBP job name ${job.name}`);
  }

  private async processPollTrigger(job: Job<GbpPollTriggerJobPayload>) {
    const telemetry: Telemetry = this.emptyTelemetry();
    const { tenantId, locationId, timeBucket } = job.data;
    const idempotencyKey = `${GBP_INGEST_IDEMPOTENCY_PREFIX}:${tenantId}:${locationId}:${timeBucket}`;

    const run = await this.ledger.createRun({
      tenantId,
      queueName: QUEUES.GBP_INGEST,
      jobName: GBP_POLL_TRIGGER_JOB_NAME,
      jobId: String(job.id ?? idempotencyKey),
      idempotencyKey
    });

    if (!run.created) {
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        gbpLocationId: true
      }
    });

    if (!tenant?.gbpLocationId) {
      await this.ledger.markState(run.run.id, 'failed', 'GBP_CONFIG_MISSING', 'GBP tenant integration missing location', telemetry);
      return;
    }

    const syncState = await this.prisma.gbpSyncState.upsert({
      where: {
        tenantId_locationId: {
          tenantId,
          locationId: tenant.gbpLocationId
        }
      },
      update: {},
      create: {
        tenantId,
        locationId: tenant.gbpLocationId,
        nextPageToken: null,
        cooldownUntil: null
      }
    });

    if (syncState.cooldownUntil && syncState.cooldownUntil.getTime() > Date.now()) {
      telemetry.cooldown_applied = true;
      telemetry.error_class = 'COOLDOWN_ACTIVE';
      await this.ledger.markState(run.run.id, 'dead_lettered', 'GBP_COOLDOWN_ACTIVE', 'Cooldown active', telemetry);
      return;
    }

    const pageJob = await this.reviewsQueue.enqueuePageFetch({
      tenantId,
      locationId: tenant.gbpLocationId,
      cursor: syncState.nextPageToken,
      pagesRemaining: this.maxPagesPerRun,
      deadlineAtEpochMs: Date.now() + this.maxRunMs
    });

    await this.ledger.markState(run.run.id, 'succeeded', undefined, undefined, {
      ...telemetry,
      trigger_page_job_id: pageJob.jobId
    });
  }

  private async processPageFetch(job: Job<GbpPageFetchJobPayload>) {
    const telemetry: Telemetry = this.emptyTelemetry();
    const { tenantId, locationId, cursor, pagesRemaining, deadlineAtEpochMs } = job.data;
    const cursorHash = this.hashCursor(cursor);
    const idempotencyKey =
      `${GBP_INGEST_IDEMPOTENCY_PREFIX}:${tenantId}:${locationId}:${cursorHash}:${GBP_INGEST_IDEMPOTENCY_VERSION}`;

    const run = await this.ledger.createRun({
      tenantId,
      queueName: QUEUES.GBP_INGEST,
      jobName: GBP_PAGE_FETCH_JOB_NAME,
      jobId: String(job.id ?? idempotencyKey),
      idempotencyKey
    });

    if (!run.created) {
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        gbpAccountId: true,
        gbpLocationId: true,
        gbpAccessTokenRef: true,
        gbpIntegrationStatus: true
      }
    });

    if (!tenant?.gbpAccountId || !tenant.gbpLocationId || !tenant.gbpAccessTokenRef) {
      telemetry.error_class = 'CONFIG_MISSING';
      await this.ledger.markState(run.run.id, 'failed', 'GBP_CONFIG_MISSING', 'GBP tenant integration missing refs', telemetry);
      return;
    }

    try {
      const result = await this.gbpClient.fetchReviews({
        accountId: tenant.gbpAccountId,
        locationId: tenant.gbpLocationId,
        accessTokenRef: tenant.gbpAccessTokenRef,
        pageToken: cursor
      });

      telemetry.pages_fetched = 1;
      telemetry.reviews_fetched = result.reviews.length;

      let lastSeenReviewAt: Date | null = null;
      for (const review of result.reviews) {
        await this.prisma.review.upsert({
          where: {
            tenantId_source_sourceReviewId: {
              tenantId,
              source: GBP_SOURCE,
              sourceReviewId: review.sourceReviewId
            }
          },
          update: {
            rating: review.rating,
            reviewBody: review.body,
            reviewerName: review.reviewerName,
            reviewedAt: review.reviewedAt ? new Date(review.reviewedAt) : null,
            redactedJson: review.redactedJson as Prisma.InputJsonValue,
            payloadHash: review.payloadHash
          },
          create: {
            tenantId,
            customerId: null,
            source: GBP_SOURCE,
            sourceReviewId: review.sourceReviewId,
            rating: review.rating,
            reviewBody: review.body,
            reviewerName: review.reviewerName,
            reviewedAt: review.reviewedAt ? new Date(review.reviewedAt) : null,
            redactedJson: review.redactedJson as Prisma.InputJsonValue,
            payloadHash: review.payloadHash
          }
        });

        telemetry.upserted += 1;

        if (review.reviewedAt) {
          const candidate = new Date(review.reviewedAt);
          if (!Number.isNaN(candidate.getTime()) && (!lastSeenReviewAt || candidate > lastSeenReviewAt)) {
            lastSeenReviewAt = candidate;
          }
        }
      }

      if (result.reviews.length === 0) {
        telemetry.skipped = 1;
      }

      await this.prisma.gbpSyncState.upsert({
        where: {
          tenantId_locationId: {
            tenantId,
            locationId
          }
        },
        update: {
          nextPageToken: result.nextPageToken,
          lastSeenReviewAt: lastSeenReviewAt ?? undefined,
          lastSuccessAt: new Date(),
          cooldownUntil: null
        },
        create: {
          tenantId,
          locationId,
          nextPageToken: result.nextPageToken,
          lastSeenReviewAt,
          lastSuccessAt: new Date(),
          cooldownUntil: null
        }
      });

      if (tenant.gbpIntegrationStatus !== 'CONNECTED') {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { gbpIntegrationStatus: 'CONNECTED' }
        });
      }

      if (result.nextPageToken && pagesRemaining > 1 && Date.now() < deadlineAtEpochMs) {
        await this.reviewsQueue.enqueuePageFetch({
          tenantId,
          locationId,
          cursor: result.nextPageToken,
          pagesRemaining: pagesRemaining - 1,
          deadlineAtEpochMs
        });
      }

      await this.ledger.markState(run.run.id, 'succeeded', undefined, undefined, telemetry);
    } catch (error) {
      if (error instanceof GbpPermanentAuthError) {
        telemetry.error_class = 'AUTH_REVOKED';
        await this.prisma.integrationAlert.create({
          data: {
            tenantId,
            integration: 'GBP',
            code: 'GBP_AUTH_REVOKED',
            severity: 'high',
            message: error.message,
            metadataJson: { locationId, cursorHash }
          }
        });

        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { gbpIntegrationStatus: 'NEEDS_REAUTH' }
        });

        await this.ledger.markState(run.run.id, 'dead_lettered', 'GBP_AUTH_REVOKED', error.message, telemetry);
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown GBP ingest failure';
      const cooldownUntil = new Date(Date.now() + this.cooldownMsFromError(message));
      telemetry.cooldown_applied = true;
      telemetry.error_class = 'TRANSIENT';

      await this.prisma.gbpSyncState.upsert({
        where: {
          tenantId_locationId: {
            tenantId,
            locationId
          }
        },
        update: {
          cooldownUntil
        },
        create: {
          tenantId,
          locationId,
          nextPageToken: cursor,
          cooldownUntil
        }
      });

      await this.prisma.integrationAlert.create({
        data: {
          tenantId,
          integration: 'GBP',
          code: 'GBP_QUOTA_OR_TRANSIENT',
          severity: 'medium',
          message,
          metadataJson: { locationId, cooldownUntil: cooldownUntil.toISOString(), cursorHash }
        }
      });

      await this.ledger.markState(run.run.id, 'failed', 'GBP_TRANSIENT_ERROR', message, telemetry);
      throw error;
    }
  }

  private cooldownMsFromError(message: string): number {
    if (message.includes('(429)')) {
      return 15 * 60 * 1000;
    }

    if (message.includes('(5')) {
      return 5 * 60 * 1000;
    }

    return 2 * 60 * 1000;
  }

  private hashCursor(cursor: string | null): string {
    return createHash('sha256').update(cursor ?? 'START_CURSOR').digest('hex').slice(0, 16);
  }

  private emptyTelemetry(): Telemetry {
    return {
      pages_fetched: 0,
      reviews_fetched: 0,
      upserted: 0,
      skipped: 0,
      cooldown_applied: false,
      error_class: null
    };
  }
}
