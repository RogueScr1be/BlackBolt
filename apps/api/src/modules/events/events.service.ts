import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listEvents(input: { tenantId: string; since?: string }) {
    const since = input.since ? new Date(input.since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const validSince = Number.isNaN(since.getTime()) ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : since;

    const [audits, revenueEvents] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId: input.tenantId, createdAt: { gte: validSince } },
        orderBy: { createdAt: 'desc' },
        take: 200
      }),
      this.prisma.revenueEvent.findMany({
        where: { tenantId: input.tenantId, occurredAt: { gte: validSince } },
        orderBy: { occurredAt: 'desc' },
        take: 200
      })
    ]);

    const items = [
      ...audits.map((item) => ({
        id: item.id,
        event_type: 'audit',
        tenant_id: item.tenantId,
        summary: item.action,
        created_at: item.createdAt.toISOString()
      })),
      ...revenueEvents.map((item) => ({
        id: item.id,
        event_type: 'revenue_event',
        tenant_id: item.tenantId,
        summary: item.description ?? 'Revenue event captured',
        amount_cents: item.amountCents,
        created_at: item.occurredAt.toISOString()
      }))
    ]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 200);

    return {
      items,
      next_cursor: null
    };
  }
}
