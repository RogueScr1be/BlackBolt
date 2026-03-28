import { PostmarkOpsController } from '../src/modules/postmark/postmark-ops.controller';
import { PostmarkOpsService } from '../src/modules/postmark/postmark-ops.service';

describe('Postmark resume proof and audit safety', () => {
  it('returns full proof and sanitizes synthetic actor ids in blocked direct resume audits', async () => {
    const prisma = {
      integrationAlert: {
        findFirst: jest.fn().mockResolvedValue({
          code: 'POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID',
          createdAt: new Date('2026-03-27T12:00:00.000Z')
        })
      },
      campaignMessage: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn()
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null)
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const policyService = {
      acknowledgeResumeChecklist: jest.fn().mockResolvedValue({}),
      getTenantPolicy: jest.fn().mockResolvedValue({
        pausedUntil: new Date('2099-01-01T00:00:00.000Z'),
        pauseReason: 'paused',
        lastErrorClass: 'provider_error',
        resumeChecklistAck: true,
        resumeChecklistAckActor: 'objective-live',
        resumeChecklistAckAt: new Date('2026-03-27T12:01:00.000Z'),
        shadowMode: true,
        shadowRate: 100,
        maxPerHour: null,
        maxPerMinute: 20,
        maxGlobalPerMinute: 200,
        bounceRateThreshold: 0.08,
        spamRateThreshold: 0.02,
        failureRateThreshold: 0.2
      }),
      resumeTenantIfChecklistAcked: jest.fn()
    };

    const service = new PostmarkOpsService(prisma as never, policyService as never, { snapshot: jest.fn() } as never);

    const result = await service.ackAndResume('tenant-1', 'objective-live', {
      action: 'POSTMARK_CONTROL_PLANE_RESUME',
      entityType: 'postmark.send_control',
      actorUserId: 'objective-live',
      surface: 'integrations/postmark/resume'
    });

    expect(result).toEqual({
      resumed: false,
      reason: 'Data invariant breach - requires engineering',
      blockingReasons: ['Data invariant breach - requires engineering'],
      pausedBefore: true,
      pausedAfter: true,
      resumeChecklistAck: true,
      resumeChecklistAckActor: 'objective-live',
      resumeChecklistAckAt: '2026-03-27T12:01:00.000Z',
      requeuedMessageCount: 0
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', id: 'objective-live' },
      select: { id: true }
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: null,
        action: 'POSTMARK_CONTROL_PLANE_RESUME',
        entityType: 'postmark.send_control',
        entityId: 'tenant-1',
        metadataJson: expect.objectContaining({
          surface: 'integrations/postmark/resume',
          actorPresented: 'objective-live',
          actorUserIdResolved: null,
          resumed: false
        })
      })
    });
  });

  it('writes exactly one audit row and persists real tenant user ids on successful resume', async () => {
    const prisma = {
      integrationAlert: { findFirst: jest.fn().mockResolvedValue(null) },
      campaignMessage: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 2 })
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const policyService = {
      acknowledgeResumeChecklist: jest.fn().mockResolvedValue({}),
      getTenantPolicy: jest
        .fn()
        .mockResolvedValueOnce({
          pausedUntil: new Date('2099-01-01T00:00:00.000Z'),
          pauseReason: 'paused',
          lastErrorClass: 'provider_error',
          resumeChecklistAck: true,
          resumeChecklistAckActor: 'user-1',
          resumeChecklistAckAt: new Date('2026-03-27T12:01:00.000Z'),
          shadowMode: true,
          shadowRate: 100,
          maxPerHour: null,
          maxPerMinute: 20,
          maxGlobalPerMinute: 200,
          bounceRateThreshold: 0.08,
          spamRateThreshold: 0.02,
          failureRateThreshold: 0.2
        })
        .mockResolvedValueOnce({
          pausedUntil: null,
          pauseReason: null,
          lastErrorClass: null,
          resumeChecklistAck: true,
          resumeChecklistAckActor: 'user-1',
          resumeChecklistAckAt: new Date('2026-03-27T12:02:00.000Z'),
          shadowMode: true,
          shadowRate: 100,
          maxPerHour: null,
          maxPerMinute: 20,
          maxGlobalPerMinute: 200,
          bounceRateThreshold: 0.08,
          spamRateThreshold: 0.02,
          failureRateThreshold: 0.2
        }),
      resumeTenantIfChecklistAcked: jest.fn().mockResolvedValue({ resumed: true })
    };

    const service = new PostmarkOpsService(prisma as never, policyService as never, { snapshot: jest.fn() } as never);

    const result = await service.ackAndResume('tenant-1', 'user-1', {
      action: 'OPERATOR_INTERVENTION_RESUME_POSTMARK',
      entityType: 'operator.intervention',
      actorUserId: 'user-1',
      surface: 'interventions/resume-postmark'
    });

    expect(result).toEqual({
      resumed: true,
      reason: null,
      blockingReasons: [],
      pausedBefore: true,
      pausedAfter: false,
      resumeChecklistAck: true,
      resumeChecklistAckActor: 'user-1',
      resumeChecklistAckAt: '2026-03-27T12:02:00.000Z',
      requeuedMessageCount: 2
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        action: 'OPERATOR_INTERVENTION_RESUME_POSTMARK',
        entityType: 'operator.intervention',
        entityId: 'tenant-1',
        metadataJson: expect.objectContaining({
          surface: 'interventions/resume-postmark',
          actorPresented: 'user-1',
          actorUserIdResolved: 'user-1',
          resumed: true,
          requeuedMessageCount: 2
        })
      })
    });
  });

  it('returns typed proof for checklist rejection before the helper runs', async () => {
    const opsService = {
      getOperatorSummary: jest.fn(),
      ackAndResume: jest.fn()
    };
    const controller = new PostmarkOpsController(opsService as never);

    const result = await controller.resume('tenant-1', { userId: 'operator' } as never, { checklistAck: false });

    expect(result).toEqual({
      resumed: false,
      reason: 'checklistAck must be true',
      blockingReasons: ['checklistAck must be true'],
      pausedBefore: false,
      pausedAfter: false,
      resumeChecklistAck: false,
      resumeChecklistAckActor: null,
      resumeChecklistAckAt: null,
      requeuedMessageCount: 0
    });
    expect(opsService.ackAndResume).not.toHaveBeenCalled();
  });
});
