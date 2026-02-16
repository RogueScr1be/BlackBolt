import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [revenueMonth, attributedBookingsMonth, newFiveStarReviewsMonth, openAlertsCount, eventCount24h] = await Promise.all([
      this.prisma.revenueEvent.aggregate({
        where: { tenantId, occurredAt: { gte: monthStart } },
        _sum: { amountCents: true }
      }),
      this.prisma.revenueAttribution.count({
        where: { tenantId, createdAt: { gte: monthStart }, isDirect: true }
      }),
      this.prisma.review.count({
        where: { tenantId, rating: 5, createdAt: { gte: monthStart } }
      }),
      this.prisma.integrationAlert.count({
        where: { tenantId, resolvedAt: null }
      }),
      this.prisma.auditLog.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    return {
      tenant_id: tenantId,
      kpis: {
        revenue_month: revenueMonth._sum.amountCents ?? 0,
        attributed_bookings_month: attributedBookingsMonth,
        new_5star_reviews_month: newFiveStarReviewsMonth,
        email_conversion_rate: 0,
        portfolio_health_score: 100,
        action_required_count: openAlertsCount
      },
      widgets: {
        open_alerts: openAlertsCount,
        events_last_24h: eventCount24h,
        last_updated_at: new Date().toISOString()
      }
    };
  }
}
