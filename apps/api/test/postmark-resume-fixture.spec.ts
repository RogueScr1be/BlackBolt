import { ConflictException, BadRequestException } from '@nestjs/common';
import {
  POSTMARK_RESUME_FIXTURE_LAST_ERROR_CLASS,
  POSTMARK_RESUME_FIXTURE_MARKER_PREFIX,
  POSTMARK_RESUME_FIXTURE_TEMPLATE_VERSION,
  PostmarkResumeFixtureService
} from '../src/modules/postmark/postmark-resume-fixture.service';

describe('Postmark resume fixture service', () => {
  const tenantId = 'tenant-1';

  function makeService(overrides?: {
    policy?: Partial<{
      shadowMode: boolean;
      shadowRate: number;
      pausedUntil: Date | null;
    }>;
    pausedProviderNullCount?: number;
    controlPauseReason?: string | null;
    customerFixtureCount?: number;
    campaignFixtureCount?: number;
    actorExists?: boolean;
  }) {
    const policy = {
      shadowMode: true,
      shadowRate: 100,
      pausedUntil: null,
      ...(overrides?.policy ?? {})
    };
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: tenantId })
      },
      campaignMessage: {
        count: jest.fn().mockResolvedValue(overrides?.pausedProviderNullCount ?? 0),
        findFirst: jest.fn()
      },
      postmarkSendControl: {
        findUnique: jest.fn().mockResolvedValue({ pauseReason: overrides?.controlPauseReason ?? null })
      },
      customer: {
        count: jest.fn().mockResolvedValue(overrides?.customerFixtureCount ?? 0),
        create: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn()
      },
      campaign: {
        count: jest.fn().mockResolvedValue(overrides?.campaignFixtureCount ?? 0),
        create: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn()
      },
      draftMessage: {
        create: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn()
      },
      auditLog: {
        create: jest.fn()
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(overrides?.actorExists ? { id: 'user-1' } : null)
      },
      $transaction: jest.fn()
    };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        shadowMode: policy.shadowMode,
        shadowRate: policy.shadowRate,
        pausedUntil: policy.pausedUntil,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: false,
        resumeChecklistAckActor: null,
        resumeChecklistAckAt: null,
        maxPerHour: null,
        maxPerMinute: 20,
        maxGlobalPerMinute: 200,
        bounceRateThreshold: 0.08,
        spamRateThreshold: 0.02,
        failureRateThreshold: 0.2
      })
    };

    return {
      prisma,
      policyService,
      service: new PostmarkResumeFixtureService(prisma as never, policyService as never)
    };
  }

  it('rejects fixture prep when tenant is not shadow-safe', async () => {
    const { service } = makeService({ policy: { shadowMode: false, shadowRate: 0 } });

    await expect(service.prepareFixture(tenantId, null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects fixture prep when tenant is already paused', async () => {
    const { service } = makeService({ policy: { pausedUntil: new Date('2099-01-01T00:00:00.000Z') } });

    await expect(service.prepareFixture(tenantId, null)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects fixture prep when paused provider-null or fixture rows already exist', async () => {
    const { service } = makeService({ pausedProviderNullCount: 1 });
    await expect(service.prepareFixture(tenantId, null)).rejects.toBeInstanceOf(ConflictException);

    const duplicate = makeService({ customerFixtureCount: 1 });
    await expect(duplicate.service.prepareFixture(tenantId, null)).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates exactly one paused fixture message, pause marker, and one audit row without send events or alerts', async () => {
    const { prisma, service } = makeService({ actorExists: false });
    const tx = {
      customer: { create: jest.fn().mockResolvedValue({ id: 'customer-1' }) },
      campaign: { create: jest.fn().mockResolvedValue({ id: 'campaign-1' }) },
      draftMessage: { create: jest.fn().mockResolvedValue({ id: 'draft-1' }) },
      campaignMessage: { create: jest.fn().mockResolvedValue({ id: 'message-1' }) },
      postmarkSendControl: { upsert: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      sendEvent: { create: jest.fn() },
      integrationAlert: { create: jest.fn() }
    };
    prisma.$transaction.mockImplementation(async (fn: (db: typeof tx) => unknown) => fn(tx));

    const result = await service.prepareFixture(tenantId, 'objective-live');

    expect(result.fixtureToken).toEqual(expect.any(String));
    expect(result.expectedRequeuedMessageCount).toBe(1);
    expect(tx.customer.create).toHaveBeenCalledTimes(1);
    expect(tx.campaign.create).toHaveBeenCalledTimes(1);
    expect(tx.draftMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateVersion: POSTMARK_RESUME_FIXTURE_TEMPLATE_VERSION,
          status: 'fixture_prepared',
          bodyText: expect.stringContaining(POSTMARK_RESUME_FIXTURE_MARKER_PREFIX)
        })
      })
    );
    expect(tx.campaignMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PAUSED',
          deliveryState: 'QUEUED',
          providerMessageId: null,
          campaignRunId: null
        })
      })
    );
    expect(tx.postmarkSendControl.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          pauseReason: expect.stringContaining(POSTMARK_RESUME_FIXTURE_MARKER_PREFIX),
          lastErrorClass: POSTMARK_RESUME_FIXTURE_LAST_ERROR_CLASS,
          resumeChecklistAck: false
        })
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        actorUserId: null,
        action: 'OPERATOR_INTERVENTION_PREPARE_POSTMARK_RESUME_FIXTURE',
        metadataJson: expect.objectContaining({
          actorPresented: 'objective-live',
          actorUserIdResolved: null,
          expectedRequeuedMessageCount: 1
        })
      })
    });
    expect(tx.sendEvent.create).not.toHaveBeenCalled();
    expect(tx.integrationAlert.create).not.toHaveBeenCalled();
  });

  it('cleanup clears only matching fixture-owned rows and writes one audit row', async () => {
    const marker = `${POSTMARK_RESUME_FIXTURE_MARKER_PREFIX}fixture-token`;
    const { prisma, service } = makeService({ controlPauseReason: marker, actorExists: true });
    prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
    prisma.campaign.findUnique.mockResolvedValue({ id: 'campaign-1' });
    prisma.draftMessage.findFirst.mockResolvedValue({ id: 'draft-1' });
    prisma.campaignMessage.count.mockResolvedValue(1);
    prisma.campaignMessage.findFirst.mockResolvedValue({ id: 'message-1' });
    const tx = {
      campaignMessage: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      draftMessage: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      campaign: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      customer: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      postmarkSendControl: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    prisma.$transaction.mockImplementation(async (fn: (db: typeof tx) => unknown) => fn(tx));

    const result = await service.cleanupFixture(tenantId, 'user-1');

    expect(result).toEqual({
      fixtureToken: 'fixture-token',
      pauseCleared: true,
      deletedCampaignMessageCount: 1,
      deletedDraftMessageCount: 1,
      deletedCampaignCount: 1,
      deletedCustomerCount: 1
    });
    expect(tx.postmarkSendControl.updateMany).toHaveBeenCalledWith({
      where: { tenantId, pauseReason: marker },
      data: expect.objectContaining({
        pausedUntil: null,
        pauseReason: null,
        resumeChecklistAck: false
      })
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        actorUserId: 'user-1',
        action: 'OPERATOR_INTERVENTION_CLEANUP_POSTMARK_RESUME_FIXTURE',
        metadataJson: expect.objectContaining({
          actorPresented: 'user-1',
          actorUserIdResolved: 'user-1',
          fixtureToken: 'fixture-token',
          pauseCleared: true
        })
      })
    });
  });

  it('cleanup rejects when tenant has non-fixture paused provider-null rows', async () => {
    const marker = `${POSTMARK_RESUME_FIXTURE_MARKER_PREFIX}fixture-token`;
    const { prisma, service } = makeService({ controlPauseReason: marker });
    prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
    prisma.campaign.findUnique.mockResolvedValue({ id: 'campaign-1' });
    prisma.draftMessage.findFirst.mockResolvedValue({ id: 'draft-1' });
    prisma.campaignMessage.count.mockResolvedValue(2);
    prisma.campaignMessage.findFirst.mockResolvedValue({ id: 'message-1' });

    await expect(service.cleanupFixture(tenantId, null)).rejects.toBeInstanceOf(ConflictException);
  });
});
