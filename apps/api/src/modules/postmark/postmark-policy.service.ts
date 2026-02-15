import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { POSTMARK_PROVIDER } from './postmark.constants';

type PolicyJson = {
  shadowMode?: boolean;
  shadowRate?: number;
  maxPerHour?: number;
  maxPerMinute?: number;
  maxGlobalPerMinute?: number;
  bounceRateThreshold?: number;
  spamRateThreshold?: number;
  failureRateThreshold?: number;
};

export type PostmarkTenantPolicy = {
  shadowMode: boolean;
  shadowRate: number;
  maxPerHour: number | null;
  pausedUntil: Date | null;
  pauseReason: string | null;
  lastErrorClass: string | null;
  resumeChecklistAck: boolean;
  maxPerMinute: number;
  maxGlobalPerMinute: number;
  bounceRateThreshold: number;
  spamRateThreshold: number;
  failureRateThreshold: number;
};

const POLICY_KEY = 'postmark_send';

@Injectable()
export class PostmarkPolicyService {
  private readonly logger = new Logger(PostmarkPolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  isGlobalKillSwitchEnabled(): boolean {
    return process.env.POSTMARK_SEND_DISABLED === '1';
  }

  async getTenantPolicy(tenantId: string): Promise<PostmarkTenantPolicy> {
    const [policyRow, controlRow] = await Promise.all([
      this.prisma.tenantPolicy.findUnique({
        where: {
          tenantId_policyKey: {
            tenantId,
            policyKey: POLICY_KEY
          }
        }
      }),
      this.prisma.postmarkSendControl.findUnique({ where: { tenantId } })
    ]);

    const json = (policyRow?.policyJson as PolicyJson | null) ?? {};
    return {
      shadowMode: json.shadowMode ?? true,
      shadowRate: this.normalizePercent(json.shadowRate ?? 100),
      maxPerHour: typeof json.maxPerHour === 'number' ? json.maxPerHour : null,
      pausedUntil: controlRow?.pausedUntil ?? null,
      pauseReason: controlRow?.pauseReason ?? null,
      lastErrorClass: controlRow?.lastErrorClass ?? null,
      resumeChecklistAck: controlRow?.resumeChecklistAck ?? false,
      maxPerMinute: json.maxPerMinute ?? 20,
      maxGlobalPerMinute: json.maxGlobalPerMinute ?? 200,
      bounceRateThreshold: json.bounceRateThreshold ?? 0.08,
      spamRateThreshold: json.spamRateThreshold ?? 0.02,
      failureRateThreshold: json.failureRateThreshold ?? 0.2
    };
  }

  shouldSimulate(input: { sendDedupeKey: string; policy: PostmarkTenantPolicy }): boolean {
    if (this.isGlobalKillSwitchEnabled()) {
      return true;
    }

    if (input.policy.shadowMode) {
      return true;
    }

    const bucket = this.hashBucket(input.sendDedupeKey);
    return bucket < input.policy.shadowRate;
  }

  async pauseTenant(input: {
    tenantId: string;
    reason: string;
    durationMinutes: number;
    errorClass: string;
    metadata?: Record<string, unknown>;
  }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
    if (!tenant) {
      return null;
    }

    const pausedUntil = new Date(Date.now() + input.durationMinutes * 60 * 1000);
    await this.updatePauseState(input.tenantId, {
      pausedUntil,
      pauseReason: input.reason,
      lastErrorClass: input.errorClass,
      resumeChecklistAck: false,
      resumeChecklistAckActor: null,
      resumeChecklistAckAt: null
    });

    await this.prisma.integrationAlert.create({
      data: {
        tenantId: input.tenantId,
        integration: POSTMARK_PROVIDER,
        code: 'POSTMARK_AUTO_PAUSED',
        severity: 'high',
        message: input.reason,
        metadataJson: {
          errorClass: input.errorClass,
          pausedUntil: pausedUntil.toISOString(),
          ...input.metadata
        }
      }
    });

    return pausedUntil;
  }

  async acknowledgeResumeChecklist(input: { tenantId: string; actor: string }) {
    const now = new Date();
    await this.updatePauseState(input.tenantId, {
      resumeChecklistAck: true,
      resumeChecklistAckActor: input.actor,
      resumeChecklistAckAt: now
    });

    return { acknowledged: true, at: now.toISOString(), actor: input.actor };
  }

  async resumeTenantIfChecklistAcked(input: { tenantId: string; actor: string }) {
    const current = await this.prisma.postmarkSendControl.findUnique({ where: { tenantId: input.tenantId } });
    if (!current?.resumeChecklistAck) {
      return { resumed: false, reason: 'Resume checklist ack required' };
    }

    await this.updatePauseState(input.tenantId, {
      pausedUntil: null,
      pauseReason: null,
      lastErrorClass: null,
      resumeChecklistAck: true,
      resumeChecklistAckActor: input.actor,
      resumeChecklistAckAt: new Date()
    });

    this.logger.log(`Postmark sends resumed for tenant ${input.tenantId} by ${input.actor}`);
    return { resumed: true };
  }

  private async updatePauseState(
    tenantId: string,
    patch: {
      pausedUntil?: Date | null;
      pauseReason?: string | null;
      lastErrorClass?: string | null;
      resumeChecklistAck?: boolean;
      resumeChecklistAckActor?: string | null;
      resumeChecklistAckAt?: Date | null;
    }
  ) {
    for (let i = 0; i < 3; i += 1) {
      const current = await this.prisma.postmarkSendControl.findUnique({ where: { tenantId } });

      if (!current) {
        try {
          await this.prisma.postmarkSendControl.create({
            data: {
              tenantId,
              pausedUntil: patch.pausedUntil ?? null,
              pauseReason: patch.pauseReason ?? null,
              lastErrorClass: patch.lastErrorClass ?? null,
              resumeChecklistAck: patch.resumeChecklistAck ?? false,
              resumeChecklistAckActor: patch.resumeChecklistAckActor ?? null,
              resumeChecklistAckAt: patch.resumeChecklistAckAt ?? null,
              policyVersion: 0
            }
          });
          return;
        } catch {
          continue;
        }
      }

      const nextPausedUntil =
        patch.pausedUntil === undefined
          ? current.pausedUntil
          : patch.pausedUntil === null
            ? null
            : current.pausedUntil && current.pausedUntil > patch.pausedUntil
              ? current.pausedUntil
              : patch.pausedUntil;

      const result = await this.prisma.postmarkSendControl.updateMany({
        where: {
          tenantId,
          policyVersion: current.policyVersion
        },
        data: {
          pausedUntil: nextPausedUntil,
          pauseReason: patch.pauseReason === undefined ? current.pauseReason : patch.pauseReason,
          lastErrorClass: patch.lastErrorClass === undefined ? current.lastErrorClass : patch.lastErrorClass,
          resumeChecklistAck:
            patch.resumeChecklistAck === undefined ? current.resumeChecklistAck : patch.resumeChecklistAck,
          resumeChecklistAckActor:
            patch.resumeChecklistAckActor === undefined ? current.resumeChecklistAckActor : patch.resumeChecklistAckActor,
          resumeChecklistAckAt:
            patch.resumeChecklistAckAt === undefined ? current.resumeChecklistAckAt : patch.resumeChecklistAckAt,
          policyVersion: {
            increment: 1
          }
        }
      });

      if (result.count === 1) {
        return;
      }
    }

    throw new Error('Unable to update postmark pause state due to concurrent modifications');
  }

  private hashBucket(value: string): number {
    const digest = createHash('sha256').update(value).digest('hex').slice(0, 8);
    return Number.parseInt(digest, 16) % 100;
  }

  private normalizePercent(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round(value)));
  }
}
