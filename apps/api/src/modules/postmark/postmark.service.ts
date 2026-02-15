import { createHash } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPostmarkSignature } from './postmark.signature';
import { DELIVERY_EVENT_TO_STATE, DELIVERY_STATE_RANK, POSTMARK_PROVIDER } from './postmark.constants';
import type { NormalizedPostmarkEvent, PostmarkWebhookPayload } from './postmark.types';
import { PostmarkQueue } from './postmark.queue';
import { PostmarkPolicyService } from './postmark-policy.service';
import { isIpAllowed, verifyBasicAuthHeader } from './postmark.auth';
import { PostmarkMetricsService } from './postmark-metrics.service';
import { PostmarkWebhookLimiterService } from './postmark-webhook-limiter.service';

@Injectable()
export class PostmarkService {
  private readonly logger = new Logger(PostmarkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly postmarkQueue: PostmarkQueue,
    private readonly policyService: PostmarkPolicyService,
    private readonly metrics: PostmarkMetricsService,
    private readonly limiter: PostmarkWebhookLimiterService
  ) {}

  async receiveWebhook(input: {
    authorizationHeader: string | undefined;
    rawBody: Buffer | undefined;
    signatureHeader: string | undefined;
    sourceIp: string | null;
    payload: PostmarkWebhookPayload;
  }) {
    if (
      !isIpAllowed({
        sourceIp: input.sourceIp,
        allowlistCsv: process.env.POSTMARK_WEBHOOK_IP_ALLOWLIST
      })
    ) {
      this.metrics.increment('webhook_auth_fail_total');
      throw new UnauthorizedException('Postmark webhook source IP not allowed');
    }

    const authMatch = verifyBasicAuthHeader({
      authorizationHeader: input.authorizationHeader,
      expectedCredential: process.env.POSTMARK_WEBHOOK_BASIC_AUTH,
      previousCredential: process.env.POSTMARK_WEBHOOK_BASIC_AUTH_PREVIOUS
    });
    if (!authMatch) {
      this.metrics.increment('webhook_auth_fail_total');
      throw new UnauthorizedException('Invalid Postmark webhook credentials');
    }
    if (authMatch === 'previous') {
      this.metrics.increment('webhook_auth_previous_cred_total');
    }

    await this.assertRateLimit(input.sourceIp, null);

    const signatureProvided = Boolean(input.signatureHeader && process.env.POSTMARK_WEBHOOK_SECRET);
    if (signatureProvided) {
      const signatureOk = verifyPostmarkSignature({
        rawBody: input.rawBody ?? Buffer.alloc(0),
        signatureHeader: input.signatureHeader,
        secret: process.env.POSTMARK_WEBHOOK_SECRET
      });

      if (!signatureOk) {
        this.logger.warn('Postmark webhook signature header present but invalid; accepted based on basic auth');
      }
    }

    const normalized = this.normalizePayload(input.payload);

    let created = false;
    const webhookEvent = await this.prisma.postmarkWebhookEvent.upsert({
      where: { providerEventId: normalized.providerEventId },
      update: {},
      create: {
        tenantId: normalized.tenantId,
        providerEventId: normalized.providerEventId,
        providerMessageId: normalized.providerMessageId,
        sourceIp: input.sourceIp,
        eventType: normalized.eventType,
        receivedAt: normalized.occurredAt,
        payloadRedactedJson: normalized.payloadRedactedJson as Prisma.InputJsonValue,
        payloadHash: normalized.payloadHash
      }
    }).then((row) => {
      created = row.createdAt.getTime() === row.updatedAt.getTime();
      return row;
    });

    if (!created) {
      this.metrics.increment('webhook_duplicate_total');
      return { accepted: true, duplicate: true, eventId: webhookEvent.id };
    }

    const resolved = await this.applyEventToSendLedger(webhookEvent.id, normalized);

    if (!resolved && normalized.providerMessageId) {
      await this.postmarkQueue.enqueueReconcile({
        webhookEventId: webhookEvent.id,
        providerMessageId: normalized.providerMessageId
      });
    }

    return {
      accepted: true,
      duplicate: false,
      eventId: webhookEvent.id,
      resolved
    };
  }

  private async assertRateLimit(sourceIp: string | null, tenantId: string | null) {
    const ipPerMinuteLimit = Number.parseInt(process.env.POSTMARK_WEBHOOK_IP_PER_MINUTE ?? '240', 10);
    const tenantPerMinuteLimit = Number.parseInt(process.env.POSTMARK_WEBHOOK_TENANT_PER_MINUTE ?? '180', 10);
    const since = new Date(Date.now() - 60_000);
    const windowMs = 60_000;

    if (sourceIp) {
      const ipAllowedByMemory = this.limiter.consume(`ip:${sourceIp}`, ipPerMinuteLimit, windowMs);
      if (!ipAllowedByMemory) {
        throw new UnauthorizedException('Postmark webhook IP rate limit exceeded');
      }
    }

    if (tenantId) {
      const tenantAllowedByMemory = this.limiter.consume(`tenant:${tenantId}`, tenantPerMinuteLimit, windowMs);
      if (!tenantAllowedByMemory) {
        throw new UnauthorizedException('Postmark webhook tenant rate limit exceeded');
      }
    }

    if (sourceIp) {
      const ipCount = await this.prisma.postmarkWebhookEvent.count({
        where: {
          sourceIp,
          createdAt: { gte: since }
        }
      });
      if (ipCount >= ipPerMinuteLimit) {
        throw new UnauthorizedException('Postmark webhook IP rate limit exceeded');
      }
    }

    if (tenantId) {
      const tenantCount = await this.prisma.postmarkWebhookEvent.count({
        where: {
          tenantId,
          createdAt: { gte: since }
        }
      });
      if (tenantCount >= tenantPerMinuteLimit) {
        throw new UnauthorizedException('Postmark webhook tenant rate limit exceeded');
      }
    }
  }

  async reconcileEventById(webhookEventId: string, resolve: (providerMessageId: string) => Promise<string | null>) {
    const event = await this.prisma.postmarkWebhookEvent.findUnique({ where: { id: webhookEventId } });
    if (!event || event.reconcileStatus === 'RESOLVED') {
      return { done: true };
    }

    if (!event.providerMessageId) {
      await this.prisma.postmarkWebhookEvent.update({
        where: { id: webhookEventId },
        data: {
          reconcileStatus: 'FAILED',
          lastError: 'Missing provider message id',
          processedAt: new Date()
        }
      });
      return { done: true };
    }

    const tenantId = await resolve(event.providerMessageId);
    if (!tenantId) {
      const attempts = event.reconcileAttempts + 1;
      const maxAttempts = 5;
      const delayMs = Math.min(60_000, 5000 * 2 ** Math.max(0, attempts - 1));
      const nextRetryAt = attempts >= maxAttempts ? null : new Date(Date.now() + delayMs);

      await this.prisma.postmarkWebhookEvent.update({
        where: { id: event.id },
        data: {
          reconcileAttempts: attempts,
          reconcileStatus: attempts >= maxAttempts ? 'FAILED' : 'PENDING',
          nextRetryAt,
          lastError: attempts >= maxAttempts ? 'Unable to resolve provider message id to tenant' : 'Reconcile pending'
        }
      });

      if (attempts >= maxAttempts && event.tenantId) {
        await this.prisma.integrationAlert.create({
          data: {
            tenantId: event.tenantId,
            integration: POSTMARK_PROVIDER,
            code: 'POSTMARK_RECONCILE_FAILED',
            severity: 'medium',
            message: `Unable to reconcile message ${event.providerMessageId}`,
            metadataJson: { webhookEventId: event.id }
          }
        });
      }

      return { done: attempts >= maxAttempts };
    }

    const payload = event.payloadRedactedJson as PostmarkWebhookPayload;
    const normalized = this.normalizePayload(payload, tenantId);
    await this.applyEventToSendLedger(event.id, normalized);

    return { done: true };
  }

  private async applyEventToSendLedger(webhookEventId: string, event: NormalizedPostmarkEvent): Promise<boolean> {
    if (!event.providerMessageId) {
      await this.prisma.postmarkWebhookEvent.update({
        where: { id: webhookEventId },
        data: {
          reconcileStatus: 'FAILED',
          lastError: 'Missing provider message id',
          processedAt: new Date()
        }
      });
      return false;
    }

    const campaignMessage = await this.prisma.campaignMessage.findFirst({
      where: {
        providerMessageId: event.providerMessageId,
        ...(event.tenantId ? { tenantId: event.tenantId } : {})
      }
    });

    if (!campaignMessage) {
      await this.prisma.postmarkWebhookEvent.update({
        where: { id: webhookEventId },
        data: {
          reconcileStatus: 'PENDING',
          nextRetryAt: new Date(Date.now() + 5000),
          lastError: 'Campaign message not found for provider message id'
        }
      });
      return false;
    }

    const effectiveTenantId = campaignMessage.tenantId;
    await this.prisma.sendEvent.upsert({
      where: {
        tenantId_providerEventId_eventType: {
          tenantId: effectiveTenantId,
          providerEventId: event.providerEventId,
          eventType: event.eventType
        }
      },
      update: {},
        create: {
          tenantId: effectiveTenantId,
          campaignMessageId: campaignMessage.id,
          provider: POSTMARK_PROVIDER,
          providerEventId: event.providerEventId,
          providerMessageId: event.providerMessageId,
          eventType: event.eventType,
          occurredAt: event.occurredAt
        }
      });

    const incomingState = DELIVERY_EVENT_TO_STATE[event.eventType.toLowerCase()];
    const currentState = campaignMessage.deliveryState;
    if (incomingState && (!currentState || DELIVERY_STATE_RANK[incomingState] >= DELIVERY_STATE_RANK[currentState])) {
      await this.prisma.campaignMessage.update({
        where: { id: campaignMessage.id },
        data: { deliveryState: incomingState }
      });
    }

    await this.prisma.postmarkWebhookEvent.update({
      where: { id: webhookEventId },
      data: {
        tenantId: effectiveTenantId,
        reconcileStatus: 'RESOLVED',
        nextRetryAt: null,
        lastError: null,
        processedAt: new Date()
      }
    });

    return true;
  }

  private normalizePayload(payload: PostmarkWebhookPayload, tenantOverride?: string | null): NormalizedPostmarkEvent {
    const redacted = this.redactPayload(payload);
    const raw = JSON.stringify(payload);
    const recordType = String(payload.RecordType ?? 'Unknown').toLowerCase();
    const messageId = payload.MessageID ? String(payload.MessageID) : null;
    const providerEventId = payload.ID
      ? `postmark:${String(payload.ID)}`
      : createHash('sha256').update(raw).digest('hex');

    const timestamp =
      payload.ReceivedAt ?? payload.DeliveredAt ?? payload.BouncedAt ?? new Date().toISOString();
    const occurredAt = Number.isNaN(new Date(timestamp).getTime()) ? new Date() : new Date(timestamp);

    const metadata = payload.Metadata ?? {};
    const tenantId = tenantOverride ?? this.getString(metadata.tenantId) ?? this.getString(metadata.tenant_id) ?? null;

    return {
      providerEventId,
      providerMessageId: messageId,
      eventType: recordType,
      occurredAt,
      tenantId,
      payloadRedactedJson: redacted,
      payloadHash: createHash('sha256').update(raw).digest('hex')
    };
  }

  private redactPayload(payload: PostmarkWebhookPayload): Record<string, unknown> {
    const blocked = new Set(['Subject', 'TextBody', 'HtmlBody', 'Body', 'Content']);
    const clone: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (blocked.has(key)) {
        clone[key] = '[REDACTED]';
      } else {
        clone[key] = value;
      }
    }

    return clone;
  }

  private getString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

}
