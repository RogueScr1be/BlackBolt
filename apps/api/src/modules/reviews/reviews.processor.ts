import { Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { Job, Queue } from 'bullmq';
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
import { POSTMARK_SEND_JOB_NAME } from '../postmark/postmark-send.queue';

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
  private readonly approvedSubjectVariants = [
    'A quick thank-you from our team',
    'We appreciated your 5-star review',
    'Thanks for sharing your experience'
  ];
  private readonly approvedOpeningVariants = [
    'Your recent feedback highlighted the care experience our team aims for.',
    'Thank you for calling out the quality of your visit in your review.',
    'Your review reinforced what matters most to our patients and team.'
  ];
  private readonly approvedCtaVariants = [
    'Book your next visit',
    'Schedule your follow-up',
    'Plan your next appointment'
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: JobRunLedgerService,
    private readonly gbpClient: GbpClient,
    private readonly reviewsQueue: ReviewsQueue,
    @InjectQueue(QUEUES.POSTMARK_SEND)
    private readonly postmarkSendQueue: Queue<{ tenantId: string; campaignMessageId: string }>
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
          await this.runReactivationWorkflow({
            tenantId,
            reviewId: persisted.id,
            rating: review.rating ?? null,
            reviewBody: review.body ?? null
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

  private async runReactivationWorkflow(input: {
    tenantId: string;
    reviewId: string;
    rating: number | null;
    reviewBody: string | null;
  }) {
    const words = (input.reviewBody ?? '').trim().split(/\s+/).filter(Boolean);
    const riskFlags = this.detectRiskFlags(input.reviewBody ?? '');
    const serviceMentioned = this.extractServiceMention(input.reviewBody ?? '');
    const keyBenefit = this.extractKeyBenefit(input.reviewBody ?? '');
    const confidence = this.calculateConfidence({
      rating: input.rating,
      wordCount: words.length,
      hasRiskFlags: riskFlags.length > 0,
      serviceMentioned
    });
    const isGenuinePositive = (input.rating ?? 0) === 5 && riskFlags.length === 0;

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

    if (!isGenuinePositive) {
      return;
    }

    const policy = await this.resolveReactivationPolicy(input.tenantId);
    const eligibleSegments =
      policy.segmentMode === 'gentle'
        ? ['SEGMENT_0_90']
        : policy.segmentMode === 'volume'
          ? ['SEGMENT_90_365', 'SEGMENT_365_PLUS']
          : ['SEGMENT_90_365'];

    const recipients = await this.prisma.customer.findMany({
      where: {
        tenantId: input.tenantId,
        segment: { in: eligibleSegments as Array<'SEGMENT_0_90' | 'SEGMENT_90_365' | 'SEGMENT_365_PLUS'> }
      },
      orderBy: { updatedAt: 'desc' },
      take: policy.maxRecipients
    });

    if (recipients.length === 0) {
      return;
    }

    const workflowState = riskFlags.length > 0 || confidence < policy.autoSendThreshold ? 'queued_for_approval' : 'approved';
    const hash = this.hashToInt(input.reviewId);
    const subject = this.approvedSubjectVariants[hash % this.approvedSubjectVariants.length];
    const opening = this.approvedOpeningVariants[hash % this.approvedOpeningVariants.length];
    const cta = this.approvedCtaVariants[hash % this.approvedCtaVariants.length];
    const sendWindow = this.nextBusinessDayAt10Utc();

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId: input.tenantId,
        campaignKey: `review-reactivation:${input.reviewId}`,
        name: `Review reactivation ${new Date().toISOString().slice(0, 10)}`,
        status: 'ingested'
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
          workflowStatus: 'classified',
          triggerReviewId: input.reviewId,
          confidence,
          segmentMode: policy.segmentMode,
          serviceMentioned,
          keyBenefit,
          subjectVariant: subject,
          openingVariant: opening,
          ctaVariant: cta,
          sendWindow: sendWindow.toISOString()
        }
      }
    });

    for (const recipient of recipients) {
      const draftBody = [
        `Subject: ${subject}`,
        '',
        opening,
        '',
        `Service highlighted: ${serviceMentioned ?? 'general care'}.`,
        `Key benefit noted: ${keyBenefit}.`,
        '',
        `${cta} using your normal patient portal.`
      ].join('\n');

      const draft = await this.prisma.draftMessage.create({
        data: {
          tenantId: input.tenantId,
          reviewId: input.reviewId,
          customerId: recipient.id,
          templateVersion: 'reactivation-v1',
          status: workflowState === 'queued_for_approval' ? 'queued_for_approval' : 'draft_composed',
          bodyText: draftBody
        }
      });

      if (workflowState === 'queued_for_approval') {
        await this.prisma.approvalItem.upsert({
          where: {
            tenantId_draftMessageId: {
              tenantId: input.tenantId,
              draftMessageId: draft.id
            }
          },
          update: { status: 'queued' },
          create: {
            tenantId: input.tenantId,
            draftMessageId: draft.id,
            requiredRole: 'OPERATOR',
            status: 'queued'
          }
        });
      }

      const sendDedupeKey = createHash('sha256')
        .update(`${input.tenantId}:${campaign.id}:${recipient.id}:reactivation-v1:${sendWindow.toISOString()}`)
        .digest('hex');

      const campaignMessage = await this.prisma.campaignMessage.create({
        data: {
          tenantId: input.tenantId,
          campaignId: campaign.id,
          customerId: recipient.id,
          draftMessageId: draft.id,
          sendDedupeKey,
          status: workflowState === 'queued_for_approval' ? 'PAUSED' : 'QUEUED',
          deliveryState: 'QUEUED'
        }
      });

      if (workflowState !== 'queued_for_approval') {
        await this.postmarkSendQueue.add(
          POSTMARK_SEND_JOB_NAME,
          { tenantId: input.tenantId, campaignMessageId: campaignMessage.id },
          {
            jobId: `postmark-send:${input.tenantId}:${campaignMessage.id}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: false,
            removeOnFail: false
          }
        );
      }

      await this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: 'worker',
          action: 'REACTIVATION_WORKFLOW_ADVANCED',
          entityType: 'campaign_message',
          entityId: campaignMessage.id,
          metadataJson: {
            workflowStatus: workflowState === 'queued_for_approval' ? 'queued_for_approval' : 'scheduled',
            confidence,
            riskFlags,
            reviewId: input.reviewId,
            segment: recipient.segment
          }
        }
      });
    }
  }

  private async resolveReactivationPolicy(tenantId: string): Promise<{
    autoSendThreshold: number;
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
    const strictVertical = json['strictVertical'] === true;
    const segmentModeRaw = typeof json['segmentMode'] === 'string' ? json['segmentMode'] : 'default';
    const segmentMode = (['default', 'volume', 'gentle'].includes(segmentModeRaw) ? segmentModeRaw : 'default') as
      | 'default'
      | 'volume'
      | 'gentle';

    return {
      autoSendThreshold: strictVertical ? 0.9 : 0.8,
      segmentMode,
      maxRecipients: typeof json['maxRecipients'] === 'number' ? Math.max(1, Math.min(200, Math.floor(json['maxRecipients']))) : 50
    };
  }

  private calculateConfidence(input: {
    rating: number | null;
    wordCount: number;
    hasRiskFlags: boolean;
    serviceMentioned: string | null;
  }): number {
    let confidence = 0;
    if (input.rating === 5) {
      confidence += 0.4;
    }
    if (input.wordCount > 20) {
      confidence += 0.2;
    }
    if (!input.hasRiskFlags) {
      confidence += 0.2;
    }
    if (input.serviceMentioned) {
      confidence += 0.2;
    }
    return Number(confidence.toFixed(4));
  }

  private detectRiskFlags(body: string): string[] {
    const text = body.toLowerCase();
    const rules: Array<[string, RegExp]> = [
      ['medical_claim', /\b(cure|guarantee|always works)\b/],
      ['phi_hint', /\b(ssn|social security|dob|date of birth|mrn)\b/],
      ['legal_risk', /\b(lawsuit|malpractice)\b/]
    ];
    return rules.filter(([, regex]) => regex.test(text)).map(([code]) => code);
  }

  private extractServiceMention(body: string): string | null {
    const text = body.toLowerCase();
    const candidates = ['cleaning', 'whitening', 'implant', 'checkup', 'consultation', 'follow-up'];
    for (const candidate of candidates) {
      if (text.includes(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private extractKeyBenefit(body: string): string {
    const text = body.trim();
    if (!text) {
      return 'positive patient feedback';
    }
    const sentence = text.split(/[.!?]/).map((item) => item.trim()).find((item) => item.length > 0);
    if (!sentence) {
      return 'positive patient feedback';
    }
    return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
  }

  private hashToInt(value: string): number {
    return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
  }

  private nextBusinessDayAt10Utc(): Date {
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 1);
    while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    next.setUTCHours(10, 0, 0, 0);
    return next;
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
