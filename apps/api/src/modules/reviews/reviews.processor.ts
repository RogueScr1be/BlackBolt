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
  GBP_POLL_SCHEDULER_JOB_NAME,
  GBP_POLL_TRIGGER_JOB_NAME
} from './reviews.constants';
import type { GbpPageFetchJobPayload, GbpPollTriggerJobPayload } from './reviews.queue';
import { ReviewsQueue } from './reviews.queue';
import {
  classifyReview,
  composeConstrainedDraft,
  nextBusinessDayAt10Local,
  renderDraftBody,
  segmentModeToLabel,
  segmentsForMode
} from './reactivation.workflow';

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
    if (job.name === GBP_POLL_SCHEDULER_JOB_NAME) {
      await this.processSchedulerTick();
      return;
    }

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

  private async processSchedulerTick() {
    if (process.env.GBP_POLL_SCHEDULER_DISABLED === '1') {
      return;
    }

    const tenants = await this.prisma.tenant.findMany({
      where: {
        gbpLocationId: { not: null },
        gbpAccessTokenRef: { not: null },
        gbpIntegrationStatus: 'CONNECTED'
      },
      select: {
        id: true,
        gbpLocationId: true
      },
      take: 1000
    });

    const timeBucket = new Date().toISOString().slice(0, 16);
    for (const tenant of tenants) {
      if (!tenant.gbpLocationId) {
        continue;
      }

      await this.reviewsQueue.enqueuePollTrigger({
        tenantId: tenant.id,
        locationId: tenant.gbpLocationId,
        timeBucket,
        delayMs: Math.floor(Math.random() * 5000)
      });
    }
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

    const tenant = await this.resolveTenantForPageFetch(tenantId);

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
        const existing = await this.prisma.review.findUnique({
          where: {
            tenantId_source_sourceReviewId: {
              tenantId,
              source: GBP_SOURCE,
              sourceReviewId: review.sourceReviewId
            }
          },
          select: { id: true }
        });

        const persisted = await this.prisma.review.upsert({
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

        if (!existing) {
          await this.prisma.reviewQueueItem.upsert({
            where: {
              tenantId_reviewId: {
                tenantId,
                reviewId: persisted.id
              }
            },
            update: {
              state: 'new',
              rating: review.rating ?? null,
              triggerReviewId: persisted.id,
              updatedAt: new Date()
            },
            create: {
              tenantId,
              reviewId: persisted.id,
              triggerReviewId: persisted.id,
              state: 'new',
              rating: review.rating ?? null,
              serviceMentioned: null,
              keyBenefit: null,
              confidence: new Prisma.Decimal(0)
            }
          });

          await this.runReactivationWorkflow({
            tenantId,
            reviewId: persisted.id,
            rating: review.rating ?? null,
            reviewBody: review.body ?? null,
            tenantTimeZone: tenant.timeZone
          });
        }

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
          data: { gbpIntegrationStatus: 'CONNECTED' },
          select: { id: true }
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
          data: { gbpIntegrationStatus: 'NEEDS_REAUTH' },
          select: { id: true }
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

  private async runReactivationWorkflow(input: {
    tenantId: string;
    reviewId: string;
    rating: number | null;
    reviewBody: string | null;
    tenantTimeZone: string;
  }) {
    const classification = classifyReview({
      rating: input.rating,
      reviewBody: input.reviewBody
    });
    const { confidence, isGenuinePositive, keyBenefit, serviceMentioned, riskFlags } = classification;

    await this.prisma.reviewClassification.upsert({
      where: {
        tenantId_reviewId_modelVersion: {
          tenantId: input.tenantId,
          reviewId: input.reviewId,
          modelVersion: 'deterministic-v1'
        }
      },
      update: {
        label: isGenuinePositive ? 'genuine_positive' : 'needs_review',
        confidence: new Prisma.Decimal(confidence)
      },
      create: {
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        modelVersion: 'deterministic-v1',
        label: isGenuinePositive ? 'genuine_positive' : 'needs_review',
        confidence: new Prisma.Decimal(confidence)
      }
    });

    await this.prisma.reviewQueueItem.upsert({
      where: {
        tenantId_reviewId: {
          tenantId: input.tenantId,
          reviewId: input.reviewId
        }
      },
      update: {
        state: 'classified',
        rating: input.rating ?? null,
        serviceMentioned,
        keyBenefit,
        confidence: new Prisma.Decimal(confidence),
        classifiedAt: new Date(),
        updatedAt: new Date()
      },
      create: {
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        triggerReviewId: input.reviewId,
        state: 'classified',
        rating: input.rating ?? null,
        serviceMentioned,
        keyBenefit,
        confidence: new Prisma.Decimal(confidence),
        classifiedAt: new Date()
      }
    });

    if (!isGenuinePositive) {
      return;
    }

    const policy = await this.resolveReactivationPolicy(input.tenantId);
    const recipients = await this.prisma.customer.findMany({
      where: {
        tenantId: input.tenantId,
        segment: { in: segmentsForMode(policy.segmentMode) }
      },
      orderBy: { updatedAt: 'desc' },
      take: policy.maxRecipients
    });

    if (recipients.length === 0) {
      return;
    }

    const composed = composeConstrainedDraft({
      reviewId: input.reviewId,
      serviceMentioned,
      keyBenefit
    });
    const sendWindow = nextBusinessDayAt10Local({ timeZone: input.tenantTimeZone ?? 'UTC' });

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId: input.tenantId,
        campaignKey: `review-reactivation:${input.reviewId}:${Date.now()}`,
        name: `Review reactivation ${new Date().toISOString().slice(0, 10)}`,
        status: 'ingested'
      }
    });

    const campaignRun = await this.prisma.campaignRun.create({
      data: {
        tenantId: input.tenantId,
        triggerReviewId: input.reviewId,
        campaignId: campaign.id,
        status: 'PAUSED',
        segmentMode: policy.segmentMode,
        sendWindowAt: sendWindow,
        recipientsTotal: recipients.length,
        startedAt: null
      }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: 'worker',
        action: 'REACTIVATION_WORKFLOW_CREATED',
        entityType: 'campaign',
        entityId: campaign.id,
        metadataJson: {
          workflowStatus: 'awaiting_approval',
          triggerReviewId: input.reviewId,
          confidence,
          segmentMode: segmentModeToLabel(policy.segmentMode),
          serviceMentioned,
          keyBenefit,
          slotSource: composed.slotSource,
          blockedPatterns: composed.blocked,
          sendWindow: sendWindow.toISOString()
        }
      }
    });

    const destination = process.env.REACTIVATION_LINK_DESTINATION ?? 'https://example.com/book';
    let queuedCount = 0;
    let approvalDraftMessageId: string | null = null;

    for (const recipient of recipients) {
      const linkCode = this.shortLinkCode({
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        recipientId: recipient.id
      });
      const trackedDestination = `${destination}${destination.includes('?') ? '&' : '?'}bb_ref=${linkCode}`;
      const draftBody = renderDraftBody({
        subject: composed.subject,
        body: composed.body,
        linkCode
      });

      const draft = await this.prisma.draftMessage.create({
        data: {
          tenantId: input.tenantId,
          reviewId: input.reviewId,
          customerId: recipient.id,
          templateVersion: 'reactivation-v1',
          status: 'queued_for_approval',
          bodyText: draftBody
        }
      });

      if (!approvalDraftMessageId) {
        approvalDraftMessageId = draft.id;
      }

      const sendDedupeKey = createHash('sha256')
        .update(`${input.tenantId}:${campaign.id}:${recipient.id}:reactivation-v1:${sendWindow.toISOString()}`)
        .digest('hex');

      const campaignMessage = await this.prisma.campaignMessage.create({
        data: {
          tenantId: input.tenantId,
          campaignId: campaign.id,
          campaignRunId: campaignRun.id,
          customerId: recipient.id,
          draftMessageId: draft.id,
          sendDedupeKey,
          status: 'PAUSED',
          deliveryState: 'QUEUED'
        }
      });

      await this.prisma.linkCode.upsert({
        where: {
          tenantId_code: {
            tenantId: input.tenantId,
            code: linkCode
          }
        },
        update: {
          campaignMessageId: campaignMessage.id,
          destinationUrl: trackedDestination
        },
        create: {
          tenantId: input.tenantId,
          campaignMessageId: campaignMessage.id,
          code: linkCode,
          destinationUrl: trackedDestination
        }
      });

      queuedCount += 1;

      await this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: 'worker',
          action: 'REACTIVATION_WORKFLOW_ADVANCED',
          entityType: 'campaign_message',
          entityId: campaignMessage.id,
          metadataJson: {
            workflowStatus: 'queued_for_approval',
            confidence,
            riskFlags,
            reviewId: input.reviewId,
            segment: recipient.segment
          }
        }
      });
    }

    if (approvalDraftMessageId) {
      await this.prisma.approvalItem.create({
        data: {
          tenantId: input.tenantId,
          draftMessageId: approvalDraftMessageId,
          campaignRunId: campaignRun.id,
          requiredRole: 'OPERATOR',
          status: 'queued',
          subjectLine: composed.subject,
          bodyText: composed.body,
          segmentMode: segmentModeToLabel(policy.segmentMode),
          sendWindowAt: sendWindow
        }
      });
    }

    await this.prisma.reviewQueueItem.upsert({
      where: {
        tenantId_reviewId: {
          tenantId: input.tenantId,
          reviewId: input.reviewId
        }
      },
      update: {
        state: 'awaiting_approval',
        campaignRunId: campaignRun.id,
        triggerReviewId: input.reviewId,
        rating: input.rating ?? null,
        serviceMentioned,
        keyBenefit,
        confidence: new Prisma.Decimal(confidence),
        awaitingApprovalAt: new Date(),
        updatedAt: new Date()
      },
      create: {
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        campaignRunId: campaignRun.id,
        triggerReviewId: input.reviewId,
        state: 'awaiting_approval',
        rating: input.rating ?? null,
        serviceMentioned,
        keyBenefit,
        confidence: new Prisma.Decimal(confidence),
        classifiedAt: new Date(),
        awaitingApprovalAt: new Date()
      }
    });

    await this.prisma.campaignRun.update({
      where: { id: campaignRun.id },
      data: {
        messagesQueued: queuedCount,
        status: 'PAUSED'
      }
    });
  }

  private async resolveReactivationPolicy(tenantId: string): Promise<{
    segmentMode: 'default' | 'volume' | 'gentle';
    maxRecipients: number;
  }> {
    const row = await this.prisma.tenantPolicy.findUnique({
      where: {
        tenantId_policyKey: {
          tenantId,
          policyKey: 'reactivation_automation'
        }
      },
      select: { policyJson: true }
    });
    const json = (row?.policyJson as Record<string, unknown> | null) ?? {};
    const segmentModeRaw = typeof json['segmentMode'] === 'string' ? json['segmentMode'] : 'default';
    const segmentMode = (['default', 'volume', 'gentle'].includes(segmentModeRaw) ? segmentModeRaw : 'default') as
      | 'default'
      | 'volume'
      | 'gentle';

    return {
      segmentMode,
      maxRecipients: typeof json['maxRecipients'] === 'number' ? Math.max(1, Math.min(200, Math.floor(json['maxRecipients']))) : 50
    };
  }

  private shortLinkCode(input: { tenantId: string; reviewId: string; recipientId: string }): string {
    return createHash('sha256')
      .update(`${input.tenantId}:${input.reviewId}:${input.recipientId}:reactivation-v1`)
      .digest('base64url')
      .slice(0, 10)
      .toLowerCase();
  }

  private async resolveTenantForPageFetch(tenantId: string): Promise<{
    id: string;
    gbpAccountId: string | null;
    gbpLocationId: string | null;
    gbpAccessTokenRef: string | null;
    gbpIntegrationStatus: string;
    timeZone: string;
  } | null> {
    try {
      return await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          gbpAccountId: true,
          gbpLocationId: true,
          gbpAccessTokenRef: true,
          gbpIntegrationStatus: true,
          timeZone: true
        }
      });
    } catch (error) {
      if (!this.isMissingTenantTimeZoneColumnError(error)) {
        throw error;
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

      if (!tenant) {
        return null;
      }

      return {
        ...tenant,
        timeZone: 'UTC'
      };
    }
  }

  private isMissingTenantTimeZoneColumnError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2022') {
      return false;
    }
    const column = String((error.meta as { column?: unknown } | undefined)?.column ?? '');
    return column.includes('tenants.time_zone');
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
