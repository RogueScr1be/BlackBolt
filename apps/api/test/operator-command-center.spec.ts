import { OperatorService } from '../src/modules/operator/operator.service';
import { OperatorController } from '../src/modules/operator/operator.controller';

describe('Operator command center', () => {
  it('builds command-center payload with KPIs, health, alerts, and activity', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      revenueEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: 120000 } }),
        findMany: jest.fn().mockResolvedValue([
          { amountCents: 25000, occurredAt: new Date('2026-02-15T11:00:00.000Z') },
          { amountCents: 15000, occurredAt: new Date('2026-02-14T11:00:00.000Z') }
        ])
      },
      revenueAttribution: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { attributedCents: 45000 } }),
        count: jest.fn().mockResolvedValue(9)
      },
      review: {
        count: jest.fn().mockResolvedValue(12),
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', rating: 5, createdAt: new Date('2026-02-14T10:00:00.000Z') },
          { id: 'r2', rating: 5, createdAt: new Date('2026-02-13T10:00:00.000Z') }
        ])
      },
      sendEvent: {
        count: jest
          .fn()
          .mockResolvedValueOnce(200)
          .mockResolvedValueOnce(30)
      },
      integrationAlert: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            code: 'GBP_AUTH_REVOKED',
            integration: 'GBP',
            severity: 'high',
            tenantId: 'tenant-1',
            createdAt: new Date('2026-02-15T10:00:00.000Z'),
            resolvedAt: null
          }
        ])
      },
      jobRun: {
        findFirst: jest.fn().mockResolvedValue({ createdAt: new Date() })
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([{ action: 'OPERATOR_INTERVENTION_ACK_ALERT', createdAt: new Date() }]),
        create: jest.fn().mockResolvedValue({})
      },
      draftMessage: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    const reviewsService = {
      enqueuePoll: jest.fn()
    };

    const postmarkOpsService = {
      getOperatorSummary: jest.fn().mockResolvedValue({
        paused: false,
        invariants: {
          sendStateBreach: { active: false }
        }
      }),
      ackAndResume: jest.fn()
    };

    const service = new OperatorService(prisma as never, reviewsService as never, postmarkOpsService as never);
    const result = await service.getCommandCenter('tenant-1');

    expect(result.tenant_id).toBe('tenant-1');
    expect(result.kpis.revenue_month).toBe(120000);
    expect(result.kpis.new_5star_reviews_month).toBe(12);
    expect(result.kpis.email_conversion_rate).toBeCloseTo(0.15, 5);
    expect(result.health.deliverability).toBe('healthy');
    expect(result.alerts).toHaveLength(1);
    expect(result.activity_feed.length).toBeGreaterThan(0);
  });

  it('ack alert resolves record and writes audit log', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      integrationAlert: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'a1',
          tenantId: 'tenant-1',
          integration: 'GBP',
          code: 'GBP_AUTH_REVOKED',
          resolvedAt: null,
          metadataJson: null
        }),
        update: jest.fn().mockResolvedValue({})
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };

    const service = new OperatorService(
      prisma as never,
      { enqueuePoll: jest.fn() } as never,
      { getOperatorSummary: jest.fn(), ackAndResume: jest.fn() } as never
    );

    const response = await service.ackAlert({ tenantId: 'tenant-1', alertId: 'a1', actorUserId: 'operator' });
    expect(response.ok).toBe(true);
    expect(response.intervention).toBe('ack-alert');
    expect(prisma.integrationAlert.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('controller delegates intervention calls', async () => {
    const operatorService = {
      getCommandCenter: jest.fn().mockResolvedValue({}),
      retryGbpIngestion: jest.fn().mockResolvedValue({ ok: true }),
      resumePostmark: jest.fn().mockResolvedValue({ ok: true }),
      ackAlert: jest.fn().mockResolvedValue({ ok: true }),
      getMonthlyReport: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1', month: '2026-02' })
    };

    const controller = new OperatorController(operatorService as never);
    await controller.getCommandCenter('tenant-1');
    await controller.retryGbpIngestion('tenant-1', { userId: 'op' } as never);
    await controller.resumePostmark('tenant-1', { userId: 'op' } as never);
    await controller.ackAlert('tenant-1', { userId: 'op' } as never, { alert_id: 'a1' });
    await controller.getMonthlyReport('tenant-1', '2026-02');

    expect(operatorService.getCommandCenter).toHaveBeenCalledWith('tenant-1');
    expect(operatorService.retryGbpIngestion).toHaveBeenCalledWith('tenant-1', 'op');
    expect(operatorService.resumePostmark).toHaveBeenCalledWith('tenant-1', 'op');
    expect(operatorService.ackAlert).toHaveBeenCalledWith({ tenantId: 'tenant-1', alertId: 'a1', actorUserId: 'op' });
    expect(operatorService.getMonthlyReport).toHaveBeenCalledWith('tenant-1', '2026-02');
  });
});
