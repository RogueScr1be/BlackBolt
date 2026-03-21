import { CampaignRunsService } from '../src/modules/campaign-runs/campaign-runs.service';

describe('CampaignRunsService', () => {
  const summaryRow = {
    id: 'run-summary',
    status: 'AWAITING_APPROVAL',
    segmentMode: 'last_seen_90_365',
    sendWindowAt: new Date('2026-02-23T14:33:45.549Z'),
    recipientsTotal: 12,
    messagesQueued: 11,
    messagesSent: 1,
    messagesFailed: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    startedAt: new Date('2026-02-23T14:33:45.549Z'),
    finishedAt: null,
    createdAt: new Date('2026-02-23T14:33:45.549Z'),
    updatedAt: new Date('2026-02-23T14:59:18.247Z'),
    campaign: {
      id: 'campaign-1',
      campaignKey: 'reactivation-shadow',
      name: 'Reactivation Shadow'
    },
    triggerReview: {
      id: 'review-1',
      rating: 5,
      reviewedAt: new Date('2026-02-23T14:33:45.543Z'),
      createdAt: new Date('2026-02-23T14:33:45.543Z')
    }
  };

  it('pauses queued messages and marks run paused', async () => {
    const prisma = {
      campaignRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1', status: 'RUNNING' }),
        update: jest.fn().mockResolvedValue({ id: 'run-1', status: 'PAUSED' })
      },
      campaignMessage: {
        updateMany: jest.fn().mockResolvedValue({ count: 4 })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };

    const service = new CampaignRunsService(prisma as never);
    const result = await service.pauseRun('tenant-1', 'run-1', 'operator');

    expect(result.ok).toBe(true);
    expect(result.intervention).toBe('pause-campaign-run');
    expect(result.messages_paused).toBe(4);
    expect(prisma.campaignMessage.updateMany).toHaveBeenCalledTimes(1);
  });

  it('resumes paused messages and marks run running', async () => {
    const prisma = {
      campaignRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-2', status: 'PAUSED' }),
        update: jest.fn().mockResolvedValue({ id: 'run-2', status: 'RUNNING' })
      },
      campaignMessage: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };

    const service = new CampaignRunsService(prisma as never);
    const result = await service.resumeRun('tenant-1', 'run-2', 'operator');

    expect(result.ok).toBe(true);
    expect(result.intervention).toBe('resume-campaign-run');
    expect(result.messages_resumed).toBe(3);
    expect(prisma.campaignMessage.updateMany).toHaveBeenCalledTimes(1);
  });

  it('normalizes leaked workflow status and label segment in campaign run lists', async () => {
    const prisma = {
      campaignRun: {
        findMany: jest.fn().mockResolvedValue([summaryRow])
      }
    };

    const service = new CampaignRunsService(prisma as never);
    const result = await service.listRuns('tenant-1', 25);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'run-summary',
      status: 'PAUSED',
      segment_mode: 'default'
    });
  });

  it('normalizes leaked workflow status and label segment in campaign run detail', async () => {
    const prisma = {
      campaignRun: {
        findFirst: jest.fn().mockResolvedValue({
          ...summaryRow,
          campaign: {
            ...summaryRow.campaign,
            status: 'ACTIVE'
          },
          triggerReview: {
            ...summaryRow.triggerReview,
            reviewBody: 'Great care and smooth follow-up.',
            reviewerName: 'Shadow Evidence'
          }
        })
      },
      campaignMessage: {
        count: jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1)
      }
    };

    const service = new CampaignRunsService(prisma as never);
    const result = await service.getRun('tenant-1', 'run-summary');

    expect(result).toMatchObject({
      id: 'run-summary',
      status: 'PAUSED',
      segment_mode: 'default',
      breakdown: {
        queued: 0,
        paused: 0,
        sent: 1,
        failed: 0
      }
    });
  });

  it('fails closed when campaign run status is outside the canonical contract', async () => {
    const prisma = {
      campaignRun: {
        findMany: jest.fn().mockResolvedValue([{ ...summaryRow, status: 'DRAFT' }])
      }
    };

    const service = new CampaignRunsService(prisma as never);
    await expect(service.listRuns('tenant-1', 25)).rejects.toThrow('Unsupported campaign run status: DRAFT');
  });

  it('fails closed when campaign run segment mode is outside the canonical contract', async () => {
    const prisma = {
      campaignRun: {
        findMany: jest.fn().mockResolvedValue([{ ...summaryRow, segmentMode: 'high_touch' }])
      }
    };

    const service = new CampaignRunsService(prisma as never);
    await expect(service.listRuns('tenant-1', 25)).rejects.toThrow('Unsupported campaign run segment mode: high_touch');
  });
});
