import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';
import { PostmarkOpsService } from '../postmark/postmark-ops.service';
import type { CommandCenterPayload, MonthlyReportPayload, OperatorAlert, OperatorHealth } from './operator.types';

type Trend = 'healthy' | 'warning' | 'critical';

@Injectable()
export class OperatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewsService: ReviewsService,
    private readonly postmarkOpsService: PostmarkOpsService
  ) {}

  async getCommandCenter(tenantId: string): Promise<CommandCenterPayload> {
    await this.assertTenant(tenantId);

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const pipelineCutoff = new Date(now.getTime() - 60 * 60 * 1000);

    const [
      revenueMonth,
      attributedMonth,
      bookingsMonth,
      newFiveStarReviewsMonth,
      sentCountMonth,
      clickCountMonth,
      unresolvedAlerts,
      latestJobRun,
      recentReviews,
      recentRevenueEvents,
      recentAudit
    ] = await Promise.all([
      this.prisma.revenueEvent.aggregate({
        where: { tenantId, occurredAt: { gte: monthStart } },
        _sum: { amountCents: true }
      }),
      this.prisma.revenueAttribution.aggregate({
        where: { tenantId, createdAt: { gte: monthStart } },
        _sum: { attributedCents: true }
      }),
      this.prisma.revenueAttribution.count({
        where: { tenantId, createdAt: { gte: monthStart }, isDirect: true }
      }),
      this.prisma.review.count({
        where: { tenantId, rating: 5, createdAt: { gte: monthStart } }
      }),
      this.prisma.sendEvent.count({
        where: { tenantId, eventType: { in: ['sent', 'sent_simulated'] }, occurredAt: { gte: monthStart } }
      }),
      this.prisma.sendEvent.count({
        where: { tenantId, eventType: 'click', occurredAt: { gte: monthStart } }
      }),
      this.prisma.integrationAlert.findMany({
        where: { tenantId, resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 25
      }),
      this.prisma.jobRun.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      }),
      this.prisma.review.findMany({
        where: { tenantId, createdAt: { gte: weekAgo } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, rating: true, createdAt: true }
      }),
      this.prisma.revenueEvent.findMany({
        where: { tenantId },
        orderBy: { occurredAt: 'desc' },
        take: 12,
        select: { amountCents: true, occurredAt: true }
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { action: true, createdAt: true }
      })
    ]);

    const alerts = unresolvedAlerts.map((alert): OperatorAlert => ({
      id: alert.id,
      type: `${alert.integration.toLowerCase()}:${alert.code.toLowerCase()}`,
      severity: this.mapSeverity(alert.severity),
      tenant_id: alert.tenantId,
      title: alert.code,
      suggested_action: this.suggestedActionForAlert(alert.code),
      execute_capability: this.executeCapabilityForAlert(alert.code),
      created_at: alert.createdAt.toISOString(),
      resolved_at: alert.resolvedAt?.toISOString() ?? null
    }));

    const postmarkSummary = await this.postmarkOpsService.getOperatorSummary(tenantId);

    const emailConversionRate = sentCountMonth > 0 ? Number((clickCountMonth / sentCountMonth).toFixed(4)) : 0;
    const health = this.buildHealth({
      unresolvedAlerts: alerts,
      latestJobRunAt: latestJobRun?.createdAt ?? null,
      pipelineCutoff,
      postmarkSummary,
      recentReviews,
      recentRevenueEvents
    });

    const healthScore = this.healthScore(health);
    const actionRequiredCount = alerts.filter((item) => item.severity !== 'info').length + (health.worker_liveness === 'critical' ? 1 : 0);

    return {
      tenant_id: tenantId,
      kpis: {
        revenue_month: revenueMonth._sum.amountCents ?? 0,
        attributed_bookings_month: bookingsMonth,
        new_5star_reviews_month: newFiveStarReviewsMonth,
        email_conversion_rate: emailConversionRate,
        portfolio_health_score: healthScore,
        action_required_count: actionRequiredCount
      },
      health,
      alerts,
      activity_feed: this.buildActivityFeed({
        tenantId,
        recentReviews,
        recentRevenueEvents,
        recentAudit
      })
    };
  }

  async retryGbpIngestion(tenantId: string, actorUserId: string | null) {
    await this.assertTenant(tenantId);
    const queued = await this.reviewsService.enqueuePoll(tenantId);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: 'OPERATOR_INTERVENTION_RETRY_GBP_INGESTION',
        entityType: 'operator.intervention',
        entityId: tenantId,
        metadataJson: {
          queue: queued.queue,
          jobId: queued.jobId,
          cooldownUntil: queued.cooldownUntil
        }
      }
    });

    return {
      ok: true,
      intervention: 'retry-gbp-ingestion',
      queued
    };
  }

  async resumePostmark(tenantId: string, actorUserId: string | null) {
    await this.assertTenant(tenantId);
    const actor = actorUserId ?? 'operator';
    const resumed = await this.postmarkOpsService.ackAndResume(tenantId, actor);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: 'OPERATOR_INTERVENTION_RESUME_POSTMARK',
        entityType: 'operator.intervention',
        entityId: tenantId,
        metadataJson: resumed as Prisma.InputJsonValue
      }
    });

    return {
      ok: true,
      intervention: 'resume-postmark',
      result: resumed
    };
  }

  async ackAlert(input: { tenantId: string; alertId: string; actorUserId: string | null }) {
    await this.assertTenant(input.tenantId);

    const alert = await this.prisma.integrationAlert.findFirst({
      where: {
        id: input.alertId,
        tenantId: input.tenantId
      }
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    const resolvedAt = alert.resolvedAt ?? new Date();
    await this.prisma.integrationAlert.update({
      where: { id: alert.id },
      data: {
        resolvedAt,
        metadataJson: {
          ...(alert.metadataJson as Record<string, unknown> | null),
          operatorAckAt: resolvedAt.toISOString(),
          operatorAckBy: input.actorUserId ?? 'operator'
        }
      }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: 'OPERATOR_INTERVENTION_ACK_ALERT',
        entityType: 'integration.alert',
        entityId: alert.id,
        metadataJson: {
          integration: alert.integration,
          code: alert.code,
          resolvedAt: resolvedAt.toISOString()
        }
      }
    });

    return {
      ok: true,
      intervention: 'ack-alert',
      alert_id: alert.id,
      resolved_at: resolvedAt.toISOString()
    };
  }

  async getMonthlyReport(tenantId: string, month: string): Promise<MonthlyReportPayload> {
    await this.assertTenant(tenantId);

    const [year, monthIndex] = this.parseMonth(month);
    const from = new Date(Date.UTC(year, monthIndex - 1, 1));
    const to = new Date(Date.UTC(year, monthIndex, 1));

    const [revenue, attributed, bookings, sends, clicks, draftMessages] = await Promise.all([
      this.prisma.revenueEvent.aggregate({
        where: { tenantId, occurredAt: { gte: from, lt: to } },
        _sum: { amountCents: true }
      }),
      this.prisma.revenueAttribution.aggregate({
        where: { tenantId, createdAt: { gte: from, lt: to } },
        _sum: { attributedCents: true }
      }),
      this.prisma.revenueAttribution.count({
        where: { tenantId, createdAt: { gte: from, lt: to }, isDirect: true }
      }),
      this.prisma.sendEvent.count({
        where: {
          tenantId,
          occurredAt: { gte: from, lt: to },
          eventType: { in: ['sent', 'sent_simulated'] }
        }
      }),
      this.prisma.sendEvent.count({
        where: { tenantId, occurredAt: { gte: from, lt: to }, eventType: 'click' }
      }),
      this.prisma.draftMessage.findMany({
        where: { tenantId, createdAt: { gte: from, lt: to } },
        select: { bodyText: true },
        take: 400
      })
    ]);

    const bookingBase = bookings;
    const bookingConservative = Math.max(0, Math.floor(bookingBase * 0.8));
    const bookingAggressive = Math.ceil(bookingBase * 1.2);

    const praised = this.extractPraisedBenefits(draftMessages.map((item) => item.bodyText));
    const attributedCents = attributed._sum.attributedCents ?? 0;
    const revenueCents = revenue._sum.amountCents ?? 0;

    return {
      tenant_id: tenantId,
      month,
      generated_at: new Date().toISOString(),
      totals: {
        revenue_cents: revenueCents,
        attributed_cents: attributedCents,
        bookings_count: bookings,
        sent_count: sends,
        click_count: clicks
      },
      estimates: {
        conservative_bookings: bookingConservative,
        base_bookings: bookingBase,
        aggressive_bookings: bookingAggressive
      },
      praised_benefits: praised,
      narrative: `Estimated reactivation impact for ${month}: ${bookingConservative}-${bookingAggressive} attributed bookings with base case ${bookingBase}.`
    };
  }

  private async assertTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
  }

  private parseMonth(month: string): [number, number] {
    const match = month.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new NotFoundException('Month must be YYYY-MM');
    }

    const year = Number.parseInt(match[1], 10);
    const monthIndex = Number.parseInt(match[2], 10);
    if (monthIndex < 1 || monthIndex > 12) {
      throw new NotFoundException('Month must be YYYY-MM');
    }

    return [year, monthIndex];
  }

  private buildHealth(input: {
    unresolvedAlerts: OperatorAlert[];
    latestJobRunAt: Date | null;
    pipelineCutoff: Date;
    postmarkSummary: Awaited<ReturnType<PostmarkOpsService['getOperatorSummary']>>;
    recentReviews: Array<{ id: string; rating: number | null; createdAt: Date }>;
    recentRevenueEvents: Array<{ amountCents: number; occurredAt: Date }>;
  }): OperatorHealth {
    const hasCritical = input.unresolvedAlerts.some((item) => item.severity === 'critical');
    const hasWarnings = input.unresolvedAlerts.some((item) => item.severity === 'warning');

    const workerLiveness: Trend = !input.latestJobRunAt
      ? 'critical'
      : input.latestJobRunAt >= input.pipelineCutoff
        ? 'healthy'
        : 'warning';

    const reviewVelocity: Trend = input.recentReviews.length >= 3 ? 'healthy' : input.recentReviews.length > 0 ? 'warning' : 'critical';

    const latestHalf = input.recentRevenueEvents.slice(0, 3).reduce((sum, row) => sum + row.amountCents, 0);
    const priorHalf = input.recentRevenueEvents.slice(3, 6).reduce((sum, row) => sum + row.amountCents, 0);
    const engagementTrend: Trend = latestHalf >= priorHalf ? 'healthy' : latestHalf > 0 ? 'warning' : 'critical';

    const deliverability: Trend = input.postmarkSummary.invariants.sendStateBreach.active
      ? 'critical'
      : input.postmarkSummary.paused
        ? 'warning'
        : 'healthy';

    return {
      deliverability,
      review_velocity: reviewVelocity,
      engagement_trend: hasCritical ? 'critical' : hasWarnings ? 'warning' : engagementTrend,
      worker_liveness: workerLiveness,
      last_pipeline_run: input.latestJobRunAt?.toISOString() ?? null
    };
  }

  private healthScore(health: OperatorHealth): number {
    const score = [health.deliverability, health.review_velocity, health.engagement_trend, health.worker_liveness]
      .map((item) => {
        if (item === 'healthy') {
          return 25;
        }
        if (item === 'warning') {
          return 15;
        }
        return 5;
      })
      .reduce((sum, item) => sum + item, 0);

    return Math.max(0, Math.min(100, score));
  }

  private buildActivityFeed(input: {
    tenantId: string;
    recentReviews: Array<{ id: string; rating: number | null; createdAt: Date }>;
    recentRevenueEvents: Array<{ amountCents: number; occurredAt: Date }>;
    recentAudit: Array<{ action: string; createdAt: Date }>;
  }) {
    const items = [
      ...input.recentRevenueEvents.slice(0, 5).map((row) => ({
        event_type: 'revenue_event',
        tenant_id: input.tenantId,
        summary: 'Revenue event captured',
        amount_cents: row.amountCents,
        created_at: row.occurredAt.toISOString()
      })),
      ...input.recentReviews.slice(0, 5).map((row) => ({
        event_type: 'review_ingested',
        tenant_id: input.tenantId,
        summary: `Review ingested (${row.rating ?? 0} star)`,
        created_at: row.createdAt.toISOString()
      })),
      ...input.recentAudit.slice(0, 5).map((row) => ({
        event_type: 'audit',
        tenant_id: input.tenantId,
        summary: row.action,
        created_at: row.createdAt.toISOString()
      }))
    ];

    return items
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 15);
  }

  private mapSeverity(raw: string): 'critical' | 'warning' | 'info' {
    switch (raw.toLowerCase()) {
    case 'high':
      return 'critical';
    case 'medium':
      return 'warning';
    default:
      return 'info';
    }
  }

  private executeCapabilityForAlert(code: string): 'retry-gbp-ingestion' | 'resume-postmark' | 'ack-alert' | 'none' {
    if (code.startsWith('GBP_')) {
      return 'retry-gbp-ingestion';
    }
    if (code.startsWith('POSTMARK_')) {
      return 'resume-postmark';
    }
    return 'ack-alert';
  }

  private suggestedActionForAlert(code: string): string {
    if (code.startsWith('GBP_')) {
      return 'Retry GBP ingestion then re-check cooldown/auth status.';
    }
    if (code.startsWith('POSTMARK_')) {
      return 'Review Postmark invariants and resume only after checklist pass.';
    }
    return 'Acknowledge alert after operator review.';
  }

  private extractPraisedBenefits(messages: string[]) {
    const bins: Record<string, number> = {
      staff: 0,
      speed: 0,
      results: 0,
      comfort: 0,
      communication: 0
    };

    for (const body of messages) {
      const text = body.toLowerCase();
      if (text.includes('staff') || text.includes('team') || text.includes('friendly')) {
        bins.staff += 1;
      }
      if (text.includes('quick') || text.includes('fast') || text.includes('timely')) {
        bins.speed += 1;
      }
      if (text.includes('result') || text.includes('outcome') || text.includes('better')) {
        bins.results += 1;
      }
      if (text.includes('comfortable') || text.includes('comfort') || text.includes('easy')) {
        bins.comfort += 1;
      }
      if (text.includes('explained') || text.includes('clear') || text.includes('communication')) {
        bins.communication += 1;
      }
    }

    return Object.entries(bins)
      .filter(([, mentions]) => mentions > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([benefit, mentions]) => ({ benefit, mentions }));
  }
}
