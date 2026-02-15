import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { RevenueController } from '../src/modules/revenue/revenue.controller';
import { RevenueService } from '../src/modules/revenue/revenue.service';
import { TenantGuard } from '../src/common/guards/tenant.guard';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req })
  } as unknown as ExecutionContext;
}

describe('Revenue summary', () => {
  it('returns 403 when header tenant and path tenant mismatch', () => {
    const guard = new TenantGuard();

    expect(() =>
      guard.canActivate(
        makeContext({
          tenantId: 'tenant-a',
          params: { tenantId: 'tenant-b' }
        })
      )
    ).toThrow(ForbiddenException);
  });

  it('returns attributed/unattributed totals and top campaigns', async () => {
    const prisma = {
      revenueEvent: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amountCents: 1000 }, _count: { _all: 2 } })
          .mockResolvedValueOnce({ _sum: { amountCents: 120 } })
          .mockResolvedValueOnce({ _sum: { amountCents: 760 } }),
        groupBy: jest.fn().mockResolvedValue([{ currency: 'USD', _sum: { amountCents: 1000 } }])
      },
      revenueAttribution: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { attributedCents: 300 } })
          .mockResolvedValueOnce({ _sum: { attributedCents: 200 } })
          .mockResolvedValueOnce({ _sum: { attributedCents: 60 } })
          .mockResolvedValueOnce({ _sum: { attributedCents: 400 } }),
        groupBy: jest.fn().mockResolvedValue([
          { campaignMessageId: 'cm-1', _sum: { attributedCents: 350 } },
          { campaignMessageId: 'cm-2', _sum: { attributedCents: 150 } }
        ])
      },
      campaignMessage: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cm-1', campaign: { id: 'camp-1', campaignKey: 'spring-2026' } },
          { id: 'cm-2', campaign: { id: 'camp-2', campaignKey: 'recall-2026' } }
        ])
      }
    };

    const service = new RevenueService(prisma as never);
    const response = await service.getRevenueSummary({
      tenantId: 'tenant-a',
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-15T00:00:00.000Z'
    });

    expect(response.rollup.total.amountCents).toBe(1000);
    expect(response.rollup.direct.amountCents).toBe(300);
    expect(response.rollup.assisted.amountCents).toBe(200);
    expect(response.rollup.unattributed.amountCents).toBe(500);
    expect(response.proof.last1h.totalCents).toBe(120);
    expect(response.proof.last1h.attributedCents).toBe(60);
    expect(response.proof.last24h.totalCents).toBe(760);
    expect(response.proof.last24h.attributedCents).toBe(400);
    expect(response.topCampaigns).toHaveLength(2);
    expect(response.topCampaigns[0].campaignId).toBe('camp-1');
  });

  it('uses bounded Prisma query plan', async () => {
    const prisma = {
      revenueEvent: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amountCents: 1000 }, _count: { _all: 2 } })
          .mockResolvedValueOnce({ _sum: { amountCents: 120 } })
          .mockResolvedValueOnce({ _sum: { amountCents: 760 } }),
        groupBy: jest.fn().mockResolvedValue([{ currency: 'USD', _sum: { amountCents: 1000 } }])
      },
      revenueAttribution: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { attributedCents: 300 } })
          .mockResolvedValueOnce({ _sum: { attributedCents: 200 } })
          .mockResolvedValueOnce({ _sum: { attributedCents: 60 } })
          .mockResolvedValueOnce({ _sum: { attributedCents: 400 } }),
        groupBy: jest.fn().mockResolvedValue([{ campaignMessageId: 'cm-1', _sum: { attributedCents: 500 } }])
      },
      campaignMessage: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cm-1', campaign: { id: 'camp-1', campaignKey: 'spring-2026' } }])
      }
    };

    const service = new RevenueService(prisma as never);
    await service.getRevenueSummary({
      tenantId: 'tenant-a',
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-15T00:00:00.000Z'
    });

    expect(prisma.revenueEvent.aggregate).toHaveBeenCalledTimes(3);
    expect(prisma.revenueAttribution.aggregate).toHaveBeenCalledTimes(4);
    expect(prisma.revenueEvent.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.revenueAttribution.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.campaignMessage.findMany).toHaveBeenCalledTimes(1);
  });

  it('controller delegates to service for matching tenant context', async () => {
    const service = {
      getRevenueSummary: jest.fn().mockResolvedValue({ tenantId: 'tenant-a' })
    };
    const controller = new RevenueController(service as never);

    await controller.getRevenueSummary('tenant-a', { tenantId: 'tenant-a' } as never, undefined, undefined);

    expect(service.getRevenueSummary).toHaveBeenCalledTimes(1);
    expect(service.getRevenueSummary).toHaveBeenCalledWith({ tenantId: 'tenant-a', from: undefined, to: undefined });
  });
});
