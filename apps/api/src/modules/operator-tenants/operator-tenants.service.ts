import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RangeKey = '30d' | '90d' | 'ytd';

@Injectable()
export class OperatorTenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTenants(scopeTenantId: string) {
    const rows = await this.prisma.tenant.findMany({
      where: { id: scopeTenantId },
      orderBy: { createdAt: 'asc' }
    });

    return {
      items: rows.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        health_score: 100,
        action_required_count: 0
      }))
    };
  }

  async getTenant(scopeTenantId: string, tenantId: string) {
    if (scopeTenantId !== tenantId) {
      throw new NotFoundException('Tenant not found');
    }

    const row = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        createdAt: true
      }
    });

    if (!row) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      health_score: 100,
      action_required_count: 0,
      created_at: row.createdAt.toISOString()
    };
  }

  async getTenantMetrics(scopeTenantId: string, tenantId: string, range: RangeKey) {
    await this.getTenant(scopeTenantId, tenantId);

    return {
      tenant_id: tenantId,
      range,
      revenue_series: [] as Array<{ date: string; amount_cents: number }>,
      booking_series: [] as Array<{ date: string; count: number }>,
      review_series: [] as Array<{ date: string; count: number }>
    };
  }
}
