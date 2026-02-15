import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { RevenueController } from '../src/modules/revenue/revenue.controller';
import { RevenueService } from '../src/modules/revenue/revenue.service';
import { TenantGuard } from '../src/common/guards/tenant.guard';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req })
  } as unknown as ExecutionContext;
}

describe('Revenue events', () => {
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

  it('returns 400 when Idempotency-Key header is missing', async () => {
    const service = { createRevenueEvent: jest.fn() };
    const controller = new RevenueController(service as never);

    await expect(
      controller.createRevenueEvent(
        'tenant-a',
        { tenantId: 'tenant-a' } as never,
        undefined,
        {
          occurredAt: '2026-02-14T00:00:00.000Z',
          amountCents: 100,
          currency: 'USD',
          kind: 'SALE' as never,
          source: 'MANUAL' as never
        }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.createRevenueEvent).not.toHaveBeenCalled();
  });

  it('creates attribution from campaignMessageId', async () => {
    const prisma = {
      revenueEvent: {
        create: jest.fn().mockResolvedValue({ id: 'rev-1', amountCents: 1000, currency: 'USD' }),
        findUnique: jest.fn()
      },
      campaignMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cm-1' }),
        findUnique: jest.fn()
      },
      linkCode: { findUnique: jest.fn() },
      revenueAttribution: { create: jest.fn().mockResolvedValue({}) }
    };

    const service = new RevenueService(prisma as never);
    const result = await service.createRevenueEvent({
      tenantId: 'tenant-a',
      idempotencyKey: 'idem-cm',
      occurredAt: '2026-02-14T00:00:00.000Z',
      amountCents: 1000,
      currency: 'USD',
      kind: 'SALE' as never,
      source: 'MANUAL' as never,
      campaignMessageId: 'cm-1'
    });

    expect(result.attributionCreated).toBe(true);
    expect(result.attributedToCampaignMessageId).toBe('cm-1');
    expect(prisma.revenueAttribution.create).toHaveBeenCalledTimes(1);
  });

  it('creates attribution from linkCode when campaignMessageId is absent', async () => {
    const prisma = {
      revenueEvent: {
        create: jest.fn().mockResolvedValue({ id: 'rev-2', amountCents: 500, currency: 'USD' }),
        findUnique: jest.fn()
      },
      campaignMessage: {
        findFirst: jest.fn(),
        findUnique: jest.fn()
      },
      linkCode: { findUnique: jest.fn().mockResolvedValue({ campaignMessageId: 'cm-from-link' }) },
      revenueAttribution: { create: jest.fn().mockResolvedValue({}) }
    };

    const service = new RevenueService(prisma as never);
    const result = await service.createRevenueEvent({
      tenantId: 'tenant-a',
      idempotencyKey: 'idem-link',
      occurredAt: '2026-02-14T00:00:00.000Z',
      amountCents: 500,
      currency: 'USD',
      kind: 'PAYMENT' as never,
      source: 'API' as never,
      linkCode: 'abc123'
    });

    expect(result.attributedToCampaignMessageId).toBe('cm-from-link');
    expect(prisma.revenueAttribution.create).toHaveBeenCalledTimes(1);
    expect(prisma.campaignMessage.findUnique).not.toHaveBeenCalled();
  });

  it('creates attribution from providerMessageId when higher priority handles absent', async () => {
    const prisma = {
      revenueEvent: {
        create: jest.fn().mockResolvedValue({ id: 'rev-3', amountCents: 700, currency: 'USD' }),
        findUnique: jest.fn()
      },
      campaignMessage: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'cm-from-provider' })
      },
      linkCode: { findUnique: jest.fn().mockResolvedValue(null) },
      revenueAttribution: { create: jest.fn().mockResolvedValue({}) }
    };

    const service = new RevenueService(prisma as never);
    const result = await service.createRevenueEvent({
      tenantId: 'tenant-a',
      idempotencyKey: 'idem-provider',
      occurredAt: '2026-02-14T00:00:00.000Z',
      amountCents: 700,
      currency: 'USD',
      kind: 'INVOICE' as never,
      source: 'IMPORT' as never,
      providerMessageId: 'pm-1'
    });

    expect(result.attributedToCampaignMessageId).toBe('cm-from-provider');
    expect(prisma.revenueAttribution.create).toHaveBeenCalledTimes(1);
  });

  it('does not attribute when campaignMessageId belongs to another tenant', async () => {
    const prisma = {
      revenueEvent: {
        create: jest.fn().mockResolvedValue({ id: 'rev-4', amountCents: 200, currency: 'USD' }),
        findUnique: jest.fn()
      },
      campaignMessage: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn()
      },
      linkCode: { findUnique: jest.fn() },
      revenueAttribution: { create: jest.fn() }
    };

    const service = new RevenueService(prisma as never);
    const result = await service.createRevenueEvent({
      tenantId: 'tenant-a',
      idempotencyKey: 'idem-cross',
      occurredAt: '2026-02-14T00:00:00.000Z',
      amountCents: 200,
      currency: 'USD',
      kind: 'SALE' as never,
      source: 'MANUAL' as never,
      campaignMessageId: 'cm-other-tenant'
    });

    expect(result.attributionCreated).toBe(false);
    expect(prisma.revenueAttribution.create).not.toHaveBeenCalled();
  });

  it('same idempotency key twice creates one event and one attribution', async () => {
    const prisma = {
      revenueEvent: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'rev-5', amountCents: 900, currency: 'USD' })
          .mockRejectedValueOnce({ code: 'P2002' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'rev-5', amountCents: 900 })
      },
      campaignMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cm-5' }),
        findUnique: jest.fn()
      },
      linkCode: { findUnique: jest.fn() },
      revenueAttribution: {
        create: jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce({ code: 'P2002' })
      }
    };

    const service = new RevenueService(prisma as never);
    const payload = {
      tenantId: 'tenant-a',
      idempotencyKey: 'idem-repeat',
      occurredAt: '2026-02-14T00:00:00.000Z',
      amountCents: 900,
      currency: 'USD',
      kind: 'SALE' as never,
      source: 'MANUAL' as never,
      campaignMessageId: 'cm-5'
    };

    const first = await service.createRevenueEvent(payload as never);
    const second = await service.createRevenueEvent(payload as never);

    expect(first.revenueEventId).toBe('rev-5');
    expect(second.revenueEventId).toBe('rev-5');
    expect(prisma.revenueEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.revenueAttribution.create).toHaveBeenCalledTimes(2);
  });
});
