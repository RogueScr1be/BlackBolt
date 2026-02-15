import { PostmarkPolicyService } from '../src/modules/postmark/postmark-policy.service';

describe('PostmarkPolicyService', () => {
  it('deterministic sampling returns stable decision for same send_dedupe_key', async () => {
    const prisma = {
      tenantPolicy: {
        findUnique: jest.fn().mockResolvedValue({
          policyJson: { shadowMode: false, shadowRate: 40 }
        })
      },
      postmarkSendControl: { findUnique: jest.fn().mockResolvedValue(null) }
    };

    const service = new PostmarkPolicyService(prisma as never);
    const policy = await service.getTenantPolicy('tenant-1');

    const first = service.shouldSimulate({ sendDedupeKey: 'dedupe-abc', policy });
    const second = service.shouldSimulate({ sendDedupeKey: 'dedupe-abc', policy });
    expect(first).toBe(second);
  });

  it('kill switch overrides tenant policy and forces simulation', async () => {
    process.env.POSTMARK_SEND_DISABLED = '1';
    const prisma = {
      tenantPolicy: { findUnique: jest.fn().mockResolvedValue({ policyJson: { shadowMode: false, shadowRate: 0 } }) },
      postmarkSendControl: { findUnique: jest.fn().mockResolvedValue(null) }
    };

    const service = new PostmarkPolicyService(prisma as never);
    const policy = await service.getTenantPolicy('tenant-1');
    expect(service.shouldSimulate({ sendDedupeKey: 'dedupe-live', policy })).toBe(true);
    delete process.env.POSTMARK_SEND_DISABLED;
  });

  it('pause updates use optimistic concurrency policyVersion check', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      tenantPolicy: { findUnique: jest.fn().mockResolvedValue({ policyJson: {} }) },
      postmarkSendControl: {
        findUnique: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          policyVersion: 3,
          pausedUntil: null,
          pauseReason: null,
          lastErrorClass: null,
          resumeChecklistAck: false,
          resumeChecklistAckActor: null,
          resumeChecklistAckAt: null
        }),
        create: jest.fn(),
        updateMany
      },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };

    const service = new PostmarkPolicyService(prisma as never);
    await service.pauseTenant({
      tenantId: 'tenant-1',
      reason: 'test pause',
      durationMinutes: 10,
      errorClass: 'test_case'
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          policyVersion: 3
        })
      })
    );
  });
});
