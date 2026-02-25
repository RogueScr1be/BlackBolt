import { createHash } from 'node:crypto';
import { Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queues/queue.constants';
import { POSTMARK_PROVIDER, POSTMARK_STALE_SEND_CLAIM_MINUTES } from './postmark.constants';
import { PostmarkClient, PostmarkProviderTransientError } from './postmark.client';
import { PostmarkPolicyService } from './postmark-policy.service';
import type { PostmarkSendJobPayload } from './postmark-send.queue';
import { POSTMARK_SEND_JOB_NAME, POSTMARK_SEND_SWEEPER_JOB_NAME } from './postmark-send.queue';
import { PostmarkMetricsService } from './postmark-metrics.service';

@Processor(QUEUES.POSTMARK_SEND)
export class PostmarkSendProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PostmarkSendProcessor.name);
  private readonly staleClaimMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly postmarkClient: PostmarkClient,
    private readonly policyService: PostmarkPolicyService,
    private readonly metrics: PostmarkMetricsService,
    @Optional()
    @InjectQueue(QUEUES.POSTMARK_SEND)
    private readonly postmarkSendQueue?: Queue<PostmarkSendJobPayload>
  ) {
    super();
  }

  onModuleInit() {
    if (this.policyService.isGlobalKillSwitchEnabled()) {
      this.logger.warn('POSTMARK_SEND_DISABLED=1 active: all sends will be simulated');
    }
  }

  async process(job: Job<PostmarkSendJobPayload>): Promise<void> {
    if (job.name === POSTMARK_SEND_SWEEPER_JOB_NAME) {
      await this.recoverStaleClaims();
      return;
    }
    if (job.name !== POSTMARK_SEND_JOB_NAME) {
      return;
    }

    const { tenantId, campaignMessageId } = job.data;
    const campaignMessage = await this.prisma.campaignMessage.findFirst({
      where: { id: campaignMessageId, tenantId },
      include: {
        customer: {
          select: {
            email: true,
            displayName: true
          }
        },
        draftMessage: {
          select: {
            bodyText: true
          }
        }
      }
    });

    if (!campaignMessage) {
      return;
    }

    if (campaignMessage.providerMessageId) {
      this.metrics.increment('send_guard_provider_message_id_block_total');
      await this.refreshCampaignRun(campaignMessage.campaignRunId);
      return;
    }
    if (campaignMessage.deliveryState === 'SENT') {
      await this.raiseInvariantAlert({
        tenantId,
        campaignMessageId: campaignMessage.id,
        code: 'SENT_WITHOUT_PROVIDER_ID',
        message: 'campaign message has SENT delivery state without provider message id'
      });
      return;
    }

    const policy = await this.policyService.getTenantPolicy(tenantId);
    if (policy.pausedUntil && policy.pausedUntil.getTime() > Date.now()) {
      await this.prisma.campaignMessage.update({
        where: { id: campaignMessage.id },
        data: { status: 'PAUSED' }
      });
      await this.refreshCampaignRun(campaignMessage.campaignRunId);
      return;
    }

    await this.enforceRatePolicy(tenantId, policy);

    const workerId = `${process.pid}:${job.id ?? 'unknown'}`;
    const staleBefore = new Date(Date.now() - this.staleClaimMs);
    const lock = await this.prisma.campaignMessage.updateMany({
      where: {
        id: campaignMessage.id,
        tenantId,
        providerMessageId: null,
        OR: [{ status: 'QUEUED' }, { status: 'SENDING', claimedAt: { lt: staleBefore } }],
        AND: [{ OR: [{ deliveryState: null }, { deliveryState: 'QUEUED' }] }]
      },
      data: {
        status: 'SENDING',
        claimedAt: new Date(),
        claimedBy: workerId,
        sendAttempt: {
          increment: 1
        }
      }
    });

    if (lock.count === 0) {
      this.metrics.increment('send_claim_zero_total');
      return;
    }
    this.metrics.increment('send_claim_success_total');

    const refreshedPolicy = await this.policyService.getTenantPolicy(tenantId);
    if (refreshedPolicy.pausedUntil && refreshedPolicy.pausedUntil.getTime() > Date.now()) {
      await this.prisma.campaignMessage.update({
        where: { id: campaignMessage.id },
        data: { status: 'PAUSED' }
      });
      await this.refreshCampaignRun(campaignMessage.campaignRunId);
      return;
    }

    const shouldSimulate = this.policyService.shouldSimulate({
      sendDedupeKey: campaignMessage.sendDedupeKey,
      policy: refreshedPolicy
    });
    if (shouldSimulate) {
      const simulatedMessageId = `shadow-${createHash('sha256')
        .update(`${tenantId}:${campaignMessage.sendDedupeKey}`)
        .digest('hex')
        .slice(0, 24)}`;
      await this.prisma.campaignMessage.update({
        where: { id: campaignMessage.id },
        data: {
          providerMessageId: simulatedMessageId,
          status: 'SENT_SIMULATED',
          deliveryState: 'SENT',
          claimedAt: null
        }
      });

      await this.prisma.sendEvent.upsert({
        where: {
          tenantId_providerEventId_eventType: {
            tenantId,
            providerEventId: `${simulatedMessageId}:sent_simulated`,
            eventType: 'sent_simulated'
          }
        },
        update: {},
        create: {
          tenantId,
          campaignMessageId: campaignMessage.id,
          provider: POSTMARK_PROVIDER,
          providerEventId: `${simulatedMessageId}:sent_simulated`,
          providerMessageId: simulatedMessageId,
          eventType: 'sent_simulated',
          occurredAt: new Date()
        }
      });

      await this.refreshCampaignRun(campaignMessage.campaignRunId);
      return;
    }

    try {
      const sent = await this.postmarkClient.sendCampaignMessage({
        tenantId,
        campaignMessageId: campaignMessage.id,
        toEmail: campaignMessage.customer?.email ?? process.env.POSTMARK_TO_FALLBACK ?? 'operator@example.com',
        customerDisplayName: campaignMessage.customer?.displayName ?? null,
        bodyText: campaignMessage.draftMessage?.bodyText ?? null
      });

      await this.prisma.campaignMessage.update({
        where: { id: campaignMessage.id },
        data: {
          providerMessageId: sent.providerMessageId,
          status: 'SENT',
          deliveryState: 'SENT',
          claimedAt: null
        }
      });

      await this.prisma.sendEvent.upsert({
        where: {
          tenantId_providerEventId_eventType: {
            tenantId,
            providerEventId: sent.providerEventId,
            eventType: 'sent'
          }
        },
        update: {},
        create: {
          tenantId,
          campaignMessageId: campaignMessage.id,
          provider: POSTMARK_PROVIDER,
          providerEventId: sent.providerEventId,
          providerMessageId: sent.providerMessageId,
          eventType: 'sent',
          occurredAt: new Date()
        }
      });
      await this.refreshCampaignRun(campaignMessage.campaignRunId);
    } catch (error) {
      await this.prisma.campaignMessage.update({
        where: { id: campaignMessage.id },
        data: { status: 'FAILED', claimedAt: null }
      });
      await this.refreshCampaignRun(campaignMessage.campaignRunId, {
        errorCode: 'POSTMARK_SEND_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown postmark send failure'
      });

      if (error instanceof PostmarkProviderTransientError) {
        await this.policyService.pauseTenant({
          tenantId,
          reason: 'Provider transient failure rate too high',
          durationMinutes: 30,
          errorClass: 'provider_5xx',
          metadata: {
            statusCode: error.statusCode,
            source: 'provider_5xx'
          }
        });
      }

      await this.evaluateFailureRateAndPause(tenantId, policy.failureRateThreshold);
      throw error;
    }

    await this.evaluateBounceAndSpamPause(tenantId, policy.bounceRateThreshold, policy.spamRateThreshold);
  }

  private async enforceRatePolicy(
    tenantId: string,
    policy: { maxPerMinute: number; maxGlobalPerMinute: number; maxPerHour: number | null }
  ) {
    const since = new Date(Date.now() - 60_000);
    const sinceHour = new Date(Date.now() - 60 * 60 * 1000);

    const [tenantRate, globalRate, tenantHourlyRate] = await Promise.all([
      this.prisma.sendEvent.count({
        where: {
          tenantId,
          eventType: { in: ['sent', 'sent_simulated'] },
          occurredAt: { gte: since }
        }
      }),
      this.prisma.sendEvent.count({
        where: {
          eventType: { in: ['sent', 'sent_simulated'] },
          occurredAt: { gte: since }
        }
      }),
      this.prisma.sendEvent.count({
        where: {
          tenantId,
          eventType: { in: ['sent', 'sent_simulated'] },
          occurredAt: { gte: sinceHour }
        }
      })
    ]);

    if (
      tenantRate >= policy.maxPerMinute ||
      globalRate >= policy.maxGlobalPerMinute ||
      (policy.maxPerHour !== null && tenantHourlyRate >= policy.maxPerHour)
    ) {
      await this.policyService.pauseTenant({
        tenantId,
        reason: 'Send throttle exceeded',
        durationMinutes: 10,
        errorClass: 'throttle',
        metadata: {
          tenantRate,
          globalRate,
          tenantHourlyRate,
          maxPerHour: policy.maxPerHour
        }
      });

      throw new Error('Postmark send throttled and tenant auto-paused');
    }
  }

  private async evaluateBounceAndSpamPause(tenantId: string, bounceRateThreshold: number, spamRateThreshold: number) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [sentCount, bounceCount, spamCount] = await Promise.all([
      this.prisma.sendEvent.count({
        where: {
          tenantId,
          eventType: { in: ['sent', 'sent_simulated'] },
          occurredAt: { gte: since }
        }
      }),
      this.prisma.sendEvent.count({
        where: {
          tenantId,
          eventType: 'bounce',
          occurredAt: { gte: since }
        }
      }),
      this.prisma.sendEvent.count({
        where: {
          tenantId,
          eventType: 'spamcomplaint',
          occurredAt: { gte: since }
        }
      })
    ]);

    const denominator = Math.max(1, sentCount);
    const bounceRate = bounceCount / denominator;
    const spamRate = spamCount / denominator;

    if (bounceRate >= bounceRateThreshold || spamRate >= spamRateThreshold) {
      await this.policyService.pauseTenant({
        tenantId,
        reason: 'Bounce/spam threshold exceeded',
        durationMinutes: 60,
        errorClass: 'deliverability',
        metadata: {
          bounceRate,
          spamRate,
          sentCount,
          bounceCount,
          spamCount
        }
      });
    }
  }

  private async evaluateFailureRateAndPause(tenantId: string, failureRateThreshold: number) {
    const since = new Date(Date.now() - 60 * 60 * 1000);

    const [failed, sent] = await Promise.all([
      this.prisma.campaignMessage.count({
        where: {
          tenantId,
          status: 'FAILED',
          createdAt: { gte: since }
        }
      }),
      this.prisma.campaignMessage.count({
        where: {
          tenantId,
          status: { in: ['SENT', 'SENT_SIMULATED'] },
          createdAt: { gte: since }
        }
      })
    ]);

    const ratio = failed / Math.max(1, failed + sent);
    if (ratio >= failureRateThreshold) {
      await this.policyService.pauseTenant({
        tenantId,
        reason: 'Queue failure rate threshold exceeded',
        durationMinutes: 30,
        errorClass: 'failure_rate',
        metadata: { failed, sent, ratio }
      });
    }
  }

  private async raiseInvariantAlert(input: {
    tenantId: string;
    campaignMessageId: string;
    code: string;
    message: string;
  }) {
    await this.prisma.integrationAlert.create({
      data: {
        tenantId: input.tenantId,
        integration: POSTMARK_PROVIDER,
        code: `POSTMARK_SEND_${input.code}`,
        severity: 'high',
        message: input.message,
        metadataJson: {
          campaignMessageId: input.campaignMessageId
        }
      }
    });
  }

  private async recoverStaleClaims() {
    const staleBefore = new Date(Date.now() - POSTMARK_STALE_SEND_CLAIM_MINUTES * 60 * 1000);
    const maxAttempts = Number.parseInt(process.env.POSTMARK_SEND_MAX_ATTEMPTS ?? '5', 10);
    const batchSize = Number.parseInt(process.env.POSTMARK_SEND_SWEEPER_BATCH ?? '50', 10);
    const stale = await this.prisma.campaignMessage.findMany({
      where: {
        status: 'SENDING',
        providerMessageId: null,
        claimedAt: { lt: staleBefore }
      },
      orderBy: { claimedAt: 'asc' },
      take: batchSize,
      select: {
        id: true,
        tenantId: true,
        campaignRunId: true,
        claimedAt: true,
        sendAttempt: true
      }
    });

    for (const item of stale) {
      const policy = await this.policyService.getTenantPolicy(item.tenantId);
      const tenantPaused = Boolean(policy.pausedUntil && policy.pausedUntil.getTime() > Date.now());
      const exceedsAttempts = item.sendAttempt >= maxAttempts;
      const targetStatus = tenantPaused || exceedsAttempts ? 'FAILED' : 'QUEUED';

      const updated = await this.prisma.campaignMessage.updateMany({
        where: {
          id: item.id,
          status: 'SENDING',
          providerMessageId: null,
          claimedAt: { lt: staleBefore }
        },
        data: {
          status: targetStatus,
          claimedAt: null,
          claimedBy: null
        }
      });
      if (updated.count === 0) {
        continue;
      }

      await this.prisma.integrationAlert.create({
        data: {
          tenantId: item.tenantId,
          integration: POSTMARK_PROVIDER,
          code: targetStatus === 'QUEUED' ? 'POSTMARK_SEND_STALE_CLAIM_RECOVERED' : 'POSTMARK_SEND_STALE_CLAIM_FAILED',
          severity: targetStatus === 'QUEUED' ? 'medium' : 'high',
          message:
            targetStatus === 'QUEUED'
              ? 'Recovered stale postmark send claim and re-queued message'
              : 'Stale postmark send claim moved to FAILED for manual intervention',
          metadataJson: {
            campaignMessageId: item.id,
            sendAttempt: item.sendAttempt,
            staleThresholdMinutes: POSTMARK_STALE_SEND_CLAIM_MINUTES,
            tenantPaused,
            maxAttempts
          }
        }
      });

      await this.refreshCampaignRun(item.campaignRunId);
    }

    await this.enqueueQueuedBacklog();
  }

  private async refreshCampaignRun(
    campaignRunId: string | null,
    error?: { errorCode: string; errorMessage: string }
  ) {
    if (!campaignRunId) {
      return;
    }

    const campaignRunModel = (this.prisma as { campaignRun?: unknown }).campaignRun as
      | {
          findUnique: (args: unknown) => Promise<{ id: string; tenantId: string; recipientsTotal: number } | null>;
          update: (args: unknown) => Promise<unknown>;
        }
      | undefined;

    if (!campaignRunModel) {
      return;
    }

    const run = await campaignRunModel.findUnique({
      where: { id: campaignRunId },
      select: { id: true, tenantId: true, recipientsTotal: true }
    });
    if (!run) {
      return;
    }

    const [queued, sent, failed, paused] = await Promise.all([
      this.prisma.campaignMessage.count({
        where: { campaignRunId, tenantId: run.tenantId, status: { in: ['QUEUED', 'SENDING'] }, providerMessageId: null }
      }),
      this.prisma.campaignMessage.count({
        where: { campaignRunId, tenantId: run.tenantId, status: { in: ['SENT', 'SENT_SIMULATED'] } }
      }),
      this.prisma.campaignMessage.count({
        where: { campaignRunId, tenantId: run.tenantId, status: 'FAILED' }
      }),
      this.prisma.campaignMessage.count({
        where: { campaignRunId, tenantId: run.tenantId, status: 'PAUSED', providerMessageId: null }
      })
    ]);

    let status = 'RUNNING';
    let finishedAt: Date | null = null;
    if (paused > 0 && queued === 0) {
      status = 'PAUSED';
    } else if (queued === 0 && sent + failed >= run.recipientsTotal) {
      status = failed > 0 ? 'FAILED' : 'COMPLETED';
      finishedAt = new Date();
    }

    await campaignRunModel.update({
      where: { id: campaignRunId },
      data: {
        status,
        messagesQueued: queued,
        messagesSent: sent,
        messagesFailed: failed,
        finishedAt,
        lastErrorCode: error?.errorCode ?? null,
        lastErrorMessage: error?.errorMessage ?? null
      }
    });
  }

  private async enqueueQueuedBacklog() {
    if (!this.postmarkSendQueue) {
      return;
    }
    const batchSize = Number.parseInt(process.env.POSTMARK_SEND_SWEEPER_BATCH ?? '50', 10);
    const pending = await this.prisma.campaignMessage.findMany({
      where: {
        status: 'QUEUED',
        providerMessageId: null
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
      select: {
        id: true,
        tenantId: true
      }
    });

    for (const item of pending) {
      await this.postmarkSendQueue.add(
        POSTMARK_SEND_JOB_NAME,
        {
          tenantId: item.tenantId,
          campaignMessageId: item.id
        },
        {
          jobId: `postmark-send:${item.tenantId}:${item.id}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: false,
          removeOnFail: false
        }
      );
    }
  }
}
