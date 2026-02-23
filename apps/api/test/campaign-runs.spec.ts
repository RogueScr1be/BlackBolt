import { CampaignRunsService } from '../src/modules/campaign-runs/campaign-runs.service';

describe('CampaignRunsService', () => {
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
});
