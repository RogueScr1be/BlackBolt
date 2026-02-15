import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostmarkPolicyService } from './postmark-policy.service';
import { PostmarkMetricsService } from './postmark-metrics.service';
import {
  POSTMARK_PROVIDER,
  POSTMARK_STALE_SEND_CLAIM_MINUTES,
  type PostmarkInvariantCodeOrUnknown,
  parsePostmarkInvariantCode,
  rankPostmarkInvariantBreach
} from './postmark.constants';

type InvariantBreach = {
  active: true;
  code: PostmarkInvariantCodeOrUnknown;
  severity: 'high' | 'medium' | 'low';
  message: string;
  detectedAt: Date;
  runbookRef: string;
  runbookQuery: string;
  nextActions: string[];
  staleThresholdMinutes?: number;
};

@Injectable()
export class PostmarkOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PostmarkPolicyService,
    private readonly metrics: PostmarkMetricsService
  ) {}

  async getOperatorSummary(tenantId: string) {
    const startedAtMs = Date.now();
    let prismaCalls = 0;
    const counted = <T>(promise: Promise<T>): Promise<T> => {
      prismaCalls += 1;
      return promise;
    };

    const tenant = await counted(this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }));
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const policy = await this.policyService.getTenantPolicy(tenantId);
    const staleClaimBefore = new Date(Date.now() - POSTMARK_STALE_SEND_CLAIM_MINUTES * 60 * 1000);
    const [recentSends, recentWebhookEvents, rollup1h, rollup24h, pausedTenantsCount, invariantAlert, stuckSending] = await Promise.all([
      counted(this.prisma.campaignMessage.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          deliveryState: true,
          providerMessageId: true,
          sendAttempt: true,
          createdAt: true
        }
      })),
      counted(this.prisma.postmarkWebhookEvent.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          providerEventId: true,
          providerMessageId: true,
          eventType: true,
          receivedAt: true,
          payloadRedactedJson: true,
          reconcileStatus: true,
          lastError: true
        }
      })),
      this.rollupWindow(tenantId, 60 * 60 * 1000, counted),
      this.rollupWindow(tenantId, 24 * 60 * 60 * 1000, counted),
      counted(this.prisma.postmarkSendControl.count({
        where: {
          pausedUntil: { gt: new Date() }
        }
      })),
      counted(this.prisma.integrationAlert.findFirst({
        where: {
          tenantId,
          integration: POSTMARK_PROVIDER,
          code: 'POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID',
          resolvedAt: null
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          code: true,
          message: true,
          createdAt: true
        }
      })),
      counted(this.prisma.campaignMessage.findFirst({
        where: {
          tenantId,
          status: 'SENDING',
          providerMessageId: null,
          claimedAt: { lt: staleClaimBefore }
        },
        orderBy: { claimedAt: 'asc' },
        select: {
          id: true,
          claimedAt: true
        }
      }))
    ]);

    const breaches: InvariantBreach[] = [];
    if (invariantAlert) {
      const normalizedCode = parsePostmarkInvariantCode(invariantAlert.code);
      breaches.push({
        active: true,
        code: normalizedCode,
        severity: normalizedCode === 'POSTMARK_INVARIANT_UNKNOWN' ? 'low' : 'high',
        message:
          normalizedCode === 'POSTMARK_INVARIANT_UNKNOWN'
            ? 'Unknown invariant breach code - requires engineering review'
            : 'Data invariant breach - requires engineering',
        detectedAt: invariantAlert.createdAt,
        runbookRef: 'docs/runbooks/postmark-send-invariants.md',
        runbookQuery: [
          '-- SENT without provider_message_id should be impossible (CHECK constraint).',
          '-- If rows exist, investigate pre-constraint data or disabled constraint.',
          'SELECT',
          '  id,',
          '  tenant_id,',
          '  status,',
          '  delivery_state,',
          '  provider_message_id,',
          '  claimed_at,',
          '  claimed_by,',
          '  send_attempt,',
          '  updated_at',
          'FROM campaign_messages',
          "WHERE delivery_state = 'SENT'",
          '  AND provider_message_id IS NULL',
          'ORDER BY updated_at DESC',
          'LIMIT 50;'
        ].join('\n'),
        nextActions: [
          'Pause tenant send path and do not manually retry.',
          'Run the read-only invariant query and capture incident scope.',
          'Escalate to engineering before any resume action.'
        ]
      });
    }
    if (stuckSending) {
      breaches.push({
        active: true,
        code: 'POSTMARK_SEND_STUCK_SENDING_WITHOUT_PROVIDER_ID',
        severity: 'medium',
        message: 'Stale send claim detected - requires engineering',
        detectedAt: stuckSending.claimedAt ?? new Date(),
        runbookRef: 'docs/runbooks/postmark-send-invariants.md',
        runbookQuery: [
          '-- Stuck SENDING with no provider_message_id (candidate crash window / stalled claim).',
          'SELECT',
          '  id,',
          '  tenant_id,',
          '  status,',
          '  delivery_state,',
          '  provider_message_id,',
          '  claimed_at,',
          '  claimed_by,',
          '  send_attempt,',
          '  updated_at',
          'FROM campaign_messages',
          "WHERE status = 'SENDING'",
          '  AND provider_message_id IS NULL',
          `  AND claimed_at < NOW() - INTERVAL '${POSTMARK_STALE_SEND_CLAIM_MINUTES} minutes'`,
          'ORDER BY claimed_at ASC',
          'LIMIT 50;'
        ].join('\n'),
        nextActions: [
          'Pause tenant send path to prevent duplicate attempts.',
          'Confirm stale claim rows with the read-only stuck-claim query.',
          'Reconcile or requeue only after engineering review.'
        ],
        staleThresholdMinutes: POSTMARK_STALE_SEND_CLAIM_MINUTES
      });
    }
    breaches.sort((a, b) => rankPostmarkInvariantBreach(b.code) - rankPostmarkInvariantBreach(a.code));
    const primaryBreach = breaches[0] ?? { active: false };

    const summary = {
      tenantId,
      paused: Boolean(policy.pausedUntil && policy.pausedUntil.getTime() > Date.now()),
      pausedUntil: policy.pausedUntil,
      pauseReason: policy.pauseReason,
      lastErrorClass: policy.lastErrorClass,
      resumeChecklistAck: policy.resumeChecklistAck,
      sends: recentSends.map((item) => ({
        campaignMessageId: item.id,
        status: item.status,
        deliveryState: item.deliveryState,
        providerMessageId: item.providerMessageId,
        attempt: item.sendAttempt,
        lastEventAt: item.createdAt
      })),
      webhookEvents: recentWebhookEvents.map((item) => ({
        id: item.id,
        providerEventId: item.providerEventId,
        providerMessageId: item.providerMessageId,
        eventType: item.eventType,
        receivedAt: item.receivedAt,
        payloadRedactedJson: item.payloadRedactedJson,
        reconcileStatus: item.reconcileStatus,
        lastError: item.lastError
      })),
      rollups: {
        last1h: rollup1h,
        last24h: rollup24h
      },
      invariants: {
        sendStateBreach: primaryBreach,
        breaches
      },
      metrics: this.metrics.snapshot(),
      gauges: {
        pausedTenantsCount
      }
    };
    if (process.env.POSTMARK_OPS_DIAGNOSTICS === '1') {
      return {
        ...summary,
        diagnostics: {
          durationMs: Date.now() - startedAtMs,
          prismaCalls
        }
      };
    }
    return summary;
  }

  async ackAndResume(tenantId: string, actor: string) {
    await this.policyService.acknowledgeResumeChecklist({ tenantId, actor });
    return this.policyService.resumeTenantIfChecklistAcked({ tenantId, actor });
  }

  private async rollupWindow(
    tenantId: string,
    windowMs: number,
    counted: <T>(promise: Promise<T>) => Promise<T>
  ) {
    const since = new Date(Date.now() - windowMs);
    const [sent, simulated, failed] = await Promise.all([
      counted(this.prisma.sendEvent.count({
        where: { tenantId, eventType: 'sent', occurredAt: { gte: since } }
      })),
      counted(this.prisma.sendEvent.count({
        where: { tenantId, eventType: 'sent_simulated', occurredAt: { gte: since } }
      })),
      counted(this.prisma.campaignMessage.count({
        where: { tenantId, status: 'FAILED', createdAt: { gte: since } }
      }))
    ]);

    return { sent, simulated, failed };
  }
}
