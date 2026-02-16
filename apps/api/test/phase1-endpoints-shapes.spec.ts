import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { EventsService } from '../src/modules/events/events.service';
import { AlertsService } from '../src/modules/alerts/alerts.service';
import { OperatorTenantsService } from '../src/modules/operator-tenants/operator-tenants.service';

describe('Phase 1 endpoint response shapes', () => {
  it('dashboard summary returns expected shape', async () => {
    const prisma = {
      revenueEvent: { aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: 0 } }) },
      revenueAttribution: { count: jest.fn().mockResolvedValue(0) },
      review: { count: jest.fn().mockResolvedValue(0) },
      integrationAlert: { count: jest.fn().mockResolvedValue(0) },
      auditLog: { count: jest.fn().mockResolvedValue(0) }
    };

    const service = new DashboardService(prisma as never);
    const result = await service.getSummary('tenant-1');

    expect(result).toEqual(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        kpis: expect.objectContaining({
          revenue_month: expect.any(Number),
          attributed_bookings_month: expect.any(Number),
          new_5star_reviews_month: expect.any(Number),
          email_conversion_rate: expect.any(Number),
          portfolio_health_score: expect.any(Number),
          action_required_count: expect.any(Number)
        }),
        widgets: expect.objectContaining({
          open_alerts: expect.any(Number),
          events_last_24h: expect.any(Number),
          last_updated_at: expect.any(String)
        })
      })
    );
  });

  it('events endpoint returns list envelope', async () => {
    const prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      revenueEvent: { findMany: jest.fn().mockResolvedValue([]) }
    };

    const service = new EventsService(prisma as never);
    const result = await service.listEvents({ tenantId: 'tenant-1' });

    expect(result).toEqual({ items: [], next_cursor: null });
  });

  it('alerts endpoint returns list envelope', async () => {
    const prisma = {
      integrationAlert: { findMany: jest.fn().mockResolvedValue([]) }
    };

    const service = new AlertsService(prisma as never);
    const result = await service.listAlerts({ tenantId: 'tenant-1', state: 'open' });

    expect(result).toEqual({ items: [] });
  });

  it('tenant endpoints return expected shapes', async () => {
    const prisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1', slug: 'demo', name: 'Demo', createdAt: new Date('2026-01-01T00:00:00.000Z') }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1', slug: 'demo', name: 'Demo', createdAt: new Date('2026-01-01T00:00:00.000Z') })
      }
    };

    const service = new OperatorTenantsService(prisma as never);
    const list = await service.listTenants('tenant-1');
    const detail = await service.getTenant('tenant-1', 'tenant-1');
    const metrics = await service.getTenantMetrics('tenant-1', 'tenant-1', '30d');

    expect(list.items).toHaveLength(1);
    expect(detail.id).toBe('tenant-1');
    expect(metrics).toEqual(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        range: '30d',
        revenue_series: [],
        booking_series: [],
        review_series: []
      })
    );
  });
});
