import { SosFollowupProcessor } from '../src/modules/sos/sos-followup.processor';
import { SosFollowupQueue } from '../src/modules/sos/sos-followup.queue';
import { SOS_FOLLOWUP_SWEEP_JOB_NAME, SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_NAME } from '../src/modules/sos/sos.constants';

describe('SOS follow-up scheduler', () => {
  afterEach(() => {
    delete process.env.SOS_FOLLOWUP_SWEEP_DISABLED;
    delete process.env.SOS_FOLLOWUP_SWEEP_INTERVAL_MS;
  });

  it('registers repeat scheduler job', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'job_1' })
    };

    const followupQueue = new SosFollowupQueue(queue as never);
    await followupQueue.onModuleInit();

    expect(queue.add).toHaveBeenCalledWith(
      SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_NAME,
      { triggeredBy: 'schedule' },
      expect.objectContaining({ repeat: { every: 86400000 } })
    );
  });

  it('scheduler job enqueues per-tenant sweep jobs', async () => {
    const prisma = {
      sosCase: {
        findMany: jest.fn().mockResolvedValue([{ tenantId: 'tenant-a' }, { tenantId: 'tenant-b' }])
      }
    };
    const ledger = {
      createRun: jest.fn(),
      markState: jest.fn()
    };
    const sosService = {
      runFollowupSweep: jest.fn()
    };
    const followupQueue = {
      enqueueSweep: jest.fn().mockResolvedValue({ jobId: 'job_1' })
    };
    const processor = new SosFollowupProcessor(
      prisma as never,
      ledger as never,
      sosService as never,
      followupQueue as never
    );

    await processor.process({
      name: SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_NAME,
      data: { triggeredBy: 'schedule' }
    } as never);

    expect(followupQueue.enqueueSweep).toHaveBeenCalledTimes(2);
    expect(followupQueue.enqueueSweep).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        triggeredBy: 'scheduler'
      })
    );
  });

  it('sweep failure marks ledger failed and raises alert', async () => {
    const prisma = {
      integrationAlert: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const ledger = {
      createRun: jest.fn().mockResolvedValue({ run: { id: 'run_1' }, created: true }),
      markState: jest.fn().mockResolvedValue({})
    };
    const sosService = {
      runFollowupSweep: jest.fn().mockRejectedValue(new Error('boom'))
    };
    const followupQueue = {
      enqueueSweep: jest.fn()
    };
    const processor = new SosFollowupProcessor(
      prisma as never,
      ledger as never,
      sosService as never,
      followupQueue as never
    );

    await expect(
      processor.process({
        id: 'job_2',
        name: SOS_FOLLOWUP_SWEEP_JOB_NAME,
        data: {
          tenantId: 'tenant-sos',
          windowStartDays: 30,
          windowEndDays: 60,
          triggeredBy: 'manual',
          idempotencyKey: 'sos-followup-sweep:tenant-sos:bucket'
        }
      } as never)
    ).rejects.toThrow('boom');

    expect(ledger.markState).toHaveBeenCalledWith('run_1', 'failed', 'SOS_FOLLOWUP_SWEEP_FAILED', 'boom');
    expect(prisma.integrationAlert.create).toHaveBeenCalled();
  });
});
