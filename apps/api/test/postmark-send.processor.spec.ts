import { PostmarkSendProcessor } from '../src/modules/postmark/postmark-send.processor';
import { POSTMARK_SEND_JOB_NAME, POSTMARK_SEND_SWEEPER_JOB_NAME } from '../src/modules/postmark/postmark-send.queue';
import { PostmarkProviderTransientError } from '../src/modules/postmark/postmark.client';

describe('PostmarkSendProcessor', () => {
  it('never sends when provider_message_id already exists', async () => {
    const prisma = {
      campaignMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'cm-locked', tenantId: 'tenant-1', status: 'QUEUED', sendDedupeKey: 'dedupe-locked', providerMessageId: 'pm-existing' }),
        updateMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };
    const postmarkClient = { sendCampaignMessage: jest.fn() };
    const policyService = {
      isGlobalKillSwitchEnabled: jest.fn().mockReturnValue(false),
      getTenantPolicy: jest.fn(),
      shouldSimulate: jest.fn(),
      pauseTenant: jest.fn()
    };
    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);
    const job = { name: POSTMARK_SEND_JOB_NAME, data: { tenantId: 'tenant-1', campaignMessageId: 'cm-locked' } };

    await processor.process(job as never);

    expect(postmarkClient.sendCampaignMessage).not.toHaveBeenCalled();
    expect(prisma.campaignMessage.updateMany).not.toHaveBeenCalled();
  });

  it('alerts and exits on SENT delivery state without provider_message_id', async () => {
    const prisma = {
      campaignMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'cm-corrupt',
            tenantId: 'tenant-1',
            status: 'QUEUED',
            sendDedupeKey: 'dedupe-corrupt',
            providerMessageId: null,
            deliveryState: 'SENT'
          }),
        updateMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };

    const postmarkClient = { sendCampaignMessage: jest.fn() };
    const policyService = {
      isGlobalKillSwitchEnabled: jest.fn().mockReturnValue(false),
      getTenantPolicy: jest.fn(),
      shouldSimulate: jest.fn(),
      pauseTenant: jest.fn()
    };
    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);
    const job = { name: POSTMARK_SEND_JOB_NAME, data: { tenantId: 'tenant-1', campaignMessageId: 'cm-corrupt' } };

    await processor.process(job as never);

    expect(prisma.integrationAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID',
          severity: 'high'
        })
      })
    );
    expect(prisma.campaignMessage.updateMany).not.toHaveBeenCalled();
    expect(postmarkClient.sendCampaignMessage).not.toHaveBeenCalled();
  });

  it('send_dedupe_key path prevents duplicate sends on retry', async () => {
    const prisma = {
      campaignMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'cm-1', tenantId: 'tenant-1', status: 'QUEUED', sendDedupeKey: 'dedupe-1' }),
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) }
    };

    const postmarkClient = {
      sendCampaignMessage: jest.fn().mockResolvedValue({ providerMessageId: 'pm-1', providerEventId: 'pm-1:sent' })
    };

    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        shadowMode: false,
        shadowRate: 0,
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true,
        maxPerHour: null,
        maxPerMinute: 50,
        maxGlobalPerMinute: 500,
        bounceRateThreshold: 1,
        spamRateThreshold: 1,
        failureRateThreshold: 1
      }),
      shouldSimulate: jest.fn().mockReturnValue(false),
      pauseTenant: jest.fn().mockResolvedValue(new Date())
    };

    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);
    const job = { name: POSTMARK_SEND_JOB_NAME, data: { tenantId: 'tenant-1', campaignMessageId: 'cm-1' } };

    await processor.process(job as never);
    await processor.process(job as never);

    expect(postmarkClient.sendCampaignMessage).toHaveBeenCalledTimes(1);
  });

  it('two workers racing same message result in one send', async () => {
    let claimed = false;
    const prisma = {
      campaignMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'cm-race', tenantId: 'tenant-1', status: 'QUEUED', sendDedupeKey: 'dedupe-race' }),
        updateMany: jest.fn().mockImplementation(async () => {
          if (claimed) {
            return { count: 0 };
          }
          claimed = true;
          return { count: 1 };
        }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) }
    };

    const postmarkClient = {
      sendCampaignMessage: jest.fn().mockResolvedValue({ providerMessageId: 'pm-race', providerEventId: 'pm-race:sent' })
    };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        shadowMode: false,
        shadowRate: 0,
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true,
        maxPerHour: null,
        maxPerMinute: 50,
        maxGlobalPerMinute: 500,
        bounceRateThreshold: 1,
        spamRateThreshold: 1,
        failureRateThreshold: 1
      }),
      shouldSimulate: jest.fn().mockReturnValue(false),
      pauseTenant: jest.fn().mockResolvedValue(new Date())
    };
    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);
    const job = { name: POSTMARK_SEND_JOB_NAME, data: { tenantId: 'tenant-1', campaignMessageId: 'cm-race' } };

    await Promise.all([processor.process(job as never), processor.process(job as never)]);

    expect(postmarkClient.sendCampaignMessage).toHaveBeenCalledTimes(1);
  });

  it('crash after claim then stale reclaim results in single provider send', async () => {
    let claimCount = 0;
    let crashed = false;
    const prisma = {
      campaignMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'cm-crash', tenantId: 'tenant-1', status: 'QUEUED', sendDedupeKey: 'dedupe-crash', providerMessageId: null }),
        updateMany: jest.fn().mockImplementation(async () => {
          claimCount += 1;
          if (claimCount === 1) {
            return { count: 1 };
          }
          return { count: 1 };
        }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) }
    };

    const postmarkClient = {
      sendCampaignMessage: jest.fn().mockResolvedValue({ providerMessageId: 'pm-crash', providerEventId: 'pm-crash:sent' })
    };
    const policyService = {
      isGlobalKillSwitchEnabled: jest.fn().mockReturnValue(false),
      getTenantPolicy: jest.fn().mockResolvedValue({
        shadowMode: false,
        shadowRate: 0,
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true,
        maxPerHour: null,
        maxPerMinute: 50,
        maxGlobalPerMinute: 500,
        bounceRateThreshold: 1,
        spamRateThreshold: 1,
        failureRateThreshold: 1
      }),
      shouldSimulate: jest.fn().mockImplementation(() => {
        if (!crashed) {
          crashed = true;
          throw new Error('simulated crash after claim');
        }
        return false;
      }),
      pauseTenant: jest.fn().mockResolvedValue(new Date())
    };
    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);
    const job = { name: POSTMARK_SEND_JOB_NAME, data: { tenantId: 'tenant-1', campaignMessageId: 'cm-crash' } };

    await expect(processor.process(job as never)).rejects.toThrow('simulated crash after claim');
    await processor.process(job as never);

    expect(postmarkClient.sendCampaignMessage).toHaveBeenCalledTimes(1);
    expect(prisma.campaignMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SENT',
          providerMessageId: 'pm-crash'
        })
      })
    );
  });

  it('crash after provider send but before provider id persist does not double-send on retry', async () => {
    type MessageState = {
      id: string;
      tenantId: string;
      status: 'QUEUED' | 'SENDING' | 'FAILED' | 'SENT';
      sendDedupeKey: string;
      providerMessageId: string | null;
      deliveryState: string | null;
      claimedAt: Date | null;
      sendAttempt: number;
    };

    const stale = new Date(Date.now() - 10 * 60 * 1000);
    const state: MessageState = {
      id: 'cm-replay',
      tenantId: 'tenant-1',
      status: 'SENDING',
      sendDedupeKey: 'dedupe-replay',
      providerMessageId: null,
      deliveryState: 'QUEUED',
      claimedAt: stale,
      sendAttempt: 1
    };
    let firstPersistAttempt = true;

    const prisma = {
      campaignMessage: {
        findFirst: jest.fn().mockImplementation(async () => ({ ...state })),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          const canClaim =
            where.id === state.id &&
            where.tenantId === state.tenantId &&
            state.providerMessageId === null &&
            (state.status === 'QUEUED' || (state.status === 'SENDING' && state.claimedAt && state.claimedAt < where.OR[1].claimedAt.lt));
          if (!canClaim) {
            return { count: 0 };
          }
          state.status = data.status;
          state.claimedAt = data.claimedAt;
          state.sendAttempt += 1;
          return { count: 1 };
        }),
        update: jest.fn().mockImplementation(async ({ data }) => {
          if (data.providerMessageId && firstPersistAttempt) {
            firstPersistAttempt = false;
            throw new Error('simulated crash before provider id persist');
          }
          state.status = data.status ?? state.status;
          if (Object.prototype.hasOwnProperty.call(data, 'providerMessageId')) {
            state.providerMessageId = data.providerMessageId ?? state.providerMessageId;
          }
          if (Object.prototype.hasOwnProperty.call(data, 'claimedAt')) {
            state.claimedAt = data.claimedAt;
          }
          if (Object.prototype.hasOwnProperty.call(data, 'deliveryState')) {
            state.deliveryState = data.deliveryState;
          }
          return {};
        }),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };
    const postmarkClient = {
      sendCampaignMessage: jest.fn().mockResolvedValue({ providerMessageId: 'pm-replay', providerEventId: 'pm-replay:sent' })
    };
    const policyService = {
      isGlobalKillSwitchEnabled: jest.fn().mockReturnValue(false),
      getTenantPolicy: jest.fn().mockResolvedValue({
        shadowMode: false,
        shadowRate: 0,
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true,
        maxPerHour: null,
        maxPerMinute: 50,
        maxGlobalPerMinute: 500,
        bounceRateThreshold: 1,
        spamRateThreshold: 1,
        failureRateThreshold: 1
      }),
      shouldSimulate: jest.fn().mockReturnValue(false),
      pauseTenant: jest.fn().mockResolvedValue(new Date())
    };
    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);
    const job = { name: POSTMARK_SEND_JOB_NAME, data: { tenantId: 'tenant-1', campaignMessageId: 'cm-replay' } };

    await expect(processor.process(job as never)).rejects.toThrow('simulated crash before provider id persist');
    await processor.process(job as never);

    expect(postmarkClient.sendCampaignMessage).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('FAILED');
    expect(state.providerMessageId).toBeNull();
  });

  it('shadow mode does not call provider and writes simulated message id', async () => {
    const prisma = {
      campaignMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'cm-1', tenantId: 'tenant-1', status: 'QUEUED', sendDedupeKey: 'dedupe-shadow' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) }
    };

    const postmarkClient = { sendCampaignMessage: jest.fn() };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        shadowMode: true,
        shadowRate: 100,
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true,
        maxPerHour: null,
        maxPerMinute: 50,
        maxGlobalPerMinute: 500,
        bounceRateThreshold: 1,
        spamRateThreshold: 1,
        failureRateThreshold: 1
      }),
      shouldSimulate: jest.fn().mockReturnValue(true),
      pauseTenant: jest.fn().mockResolvedValue(new Date())
    };

    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);
    const job = { name: POSTMARK_SEND_JOB_NAME, data: { tenantId: 'tenant-1', campaignMessageId: 'cm-1' } };

    await processor.process(job as never);

    expect(postmarkClient.sendCampaignMessage).not.toHaveBeenCalled();
    expect(prisma.campaignMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SENT_SIMULATED',
          providerMessageId: expect.stringMatching(/^shadow-/)
        })
      })
    );
    const firstProviderId = (prisma.campaignMessage.update as jest.Mock).mock.calls[0][0].data.providerMessageId as string;
    await processor.process(job as never);
    const secondProviderId = (prisma.campaignMessage.update as jest.Mock).mock.calls[1][0].data.providerMessageId as string;
    expect(firstProviderId).toBe(secondProviderId);
  });

  it('paused tenant blocks sends', async () => {
    const prisma = {
      campaignMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'cm-1', tenantId: 'tenant-1', status: 'QUEUED', sendDedupeKey: 'dedupe-paused' }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({})
      }
    };

    const postmarkClient = { sendCampaignMessage: jest.fn() };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        shadowMode: false,
        shadowRate: 0,
        pausedUntil: new Date(Date.now() + 60_000),
        pauseReason: 'manual',
        lastErrorClass: null,
        resumeChecklistAck: true,
        maxPerHour: null,
        maxPerMinute: 50,
        maxGlobalPerMinute: 500,
        bounceRateThreshold: 1,
        spamRateThreshold: 1,
        failureRateThreshold: 1
      }),
      shouldSimulate: jest.fn().mockReturnValue(false),
      pauseTenant: jest.fn().mockResolvedValue(new Date())
    };

    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);
    const job = { name: POSTMARK_SEND_JOB_NAME, data: { tenantId: 'tenant-1', campaignMessageId: 'cm-1' } };

    await processor.process(job as never);

    expect(prisma.campaignMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAUSED' }) })
    );
    expect(postmarkClient.sendCampaignMessage).not.toHaveBeenCalled();
  });

  it('provider 5xx auto-pauses tenant', async () => {
    const prisma = {
      campaignMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'cm-1', tenantId: 'tenant-1', status: 'QUEUED', sendDedupeKey: 'dedupe-fail' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) }
    };

    const postmarkClient = {
      sendCampaignMessage: jest.fn().mockRejectedValue(new PostmarkProviderTransientError(503, 'upstream down'))
    };

    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        shadowMode: false,
        shadowRate: 0,
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true,
        maxPerHour: null,
        maxPerMinute: 50,
        maxGlobalPerMinute: 500,
        bounceRateThreshold: 1,
        spamRateThreshold: 1,
        failureRateThreshold: 1
      }),
      shouldSimulate: jest.fn().mockReturnValue(false),
      pauseTenant: jest.fn().mockResolvedValue(new Date())
    };

    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);
    const job = { name: POSTMARK_SEND_JOB_NAME, data: { tenantId: 'tenant-1', campaignMessageId: 'cm-1' } };

    await expect(processor.process(job as never)).rejects.toThrow('upstream down');
    expect(policyService.pauseTenant).toHaveBeenCalled();
  });

  it('sweeper re-queues stale sending claims when tenant is not paused', async () => {
    const prisma = {
      campaignMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cm-stale',
            tenantId: 'tenant-1',
            claimedAt: new Date(Date.now() - 20 * 60 * 1000),
            sendAttempt: 1
          }
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };
    const postmarkClient = { sendCampaignMessage: jest.fn() };
    const policyService = {
      isGlobalKillSwitchEnabled: jest.fn().mockReturnValue(false),
      getTenantPolicy: jest.fn().mockResolvedValue({
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true
      }),
      shouldSimulate: jest.fn(),
      pauseTenant: jest.fn()
    };
    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);

    await processor.process({ name: POSTMARK_SEND_SWEEPER_JOB_NAME } as never);

    expect(prisma.campaignMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED',
          claimedAt: null,
          claimedBy: null
        })
      })
    );
    expect(prisma.integrationAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'POSTMARK_SEND_STALE_CLAIM_RECOVERED'
        })
      })
    );
  });

  it('sweeper marks stale sending claims failed when tenant paused', async () => {
    const prisma = {
      campaignMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cm-stale',
            tenantId: 'tenant-1',
            claimedAt: new Date(Date.now() - 20 * 60 * 1000),
            sendAttempt: 1
          }
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0)
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };
    const postmarkClient = { sendCampaignMessage: jest.fn() };
    const policyService = {
      isGlobalKillSwitchEnabled: jest.fn().mockReturnValue(false),
      getTenantPolicy: jest.fn().mockResolvedValue({
        pausedUntil: new Date(Date.now() + 60_000),
        pauseReason: 'manual',
        lastErrorClass: null,
        resumeChecklistAck: true
      }),
      shouldSimulate: jest.fn(),
      pauseTenant: jest.fn()
    };
    const metrics = { increment: jest.fn() };
    const processor = new PostmarkSendProcessor(prisma as never, postmarkClient as never, policyService as never, metrics as never);

    await processor.process({ name: POSTMARK_SEND_SWEEPER_JOB_NAME } as never);

    expect(prisma.campaignMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          claimedAt: null,
          claimedBy: null
        })
      })
    );
    expect(prisma.integrationAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'POSTMARK_SEND_STALE_CLAIM_FAILED'
        })
      })
    );
  });
});
