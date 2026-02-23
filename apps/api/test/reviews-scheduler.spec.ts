import { ReviewsProcessor } from '../src/modules/reviews/reviews.processor';
import { GBP_POLL_SCHEDULER_JOB_NAME } from '../src/modules/reviews/reviews.constants';

describe('Reviews scheduler', () => {
  it('enqueues poll triggers for connected GBP tenants', async () => {
    const prisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'tenant-1', gbpLocationId: 'loc-1' },
          { id: 'tenant-2', gbpLocationId: 'loc-2' }
        ])
      }
    };

    const processor = new ReviewsProcessor(
      prisma as never,
      { createRun: jest.fn(), markState: jest.fn() } as never,
      {} as never,
      {
        enqueuePollTrigger: jest.fn().mockResolvedValue({})
      } as never
    );

    await processor.process({ name: GBP_POLL_SCHEDULER_JOB_NAME, data: {} } as never);

    expect(prisma.tenant.findMany).toHaveBeenCalledTimes(1);
  });
});
