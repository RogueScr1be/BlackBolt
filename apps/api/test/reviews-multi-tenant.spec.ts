import { ReviewsService } from '../src/modules/reviews/reviews.service';

describe('Reviews multi-tenant and cooldown behavior', () => {
  it('queries reviews scoped to tenant id', async () => {
    const prisma = {
      review: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    const queue = { enqueue: jest.fn() };
    const service = new ReviewsService(prisma as never, queue as never);

    await service.listReviews({ tenantId: 'tenant-a', limit: 50 });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' })
      })
    );
  });

  it('does not enqueue when cooldown is active', async () => {
    const queue = { enqueue: jest.fn() };
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', gbpLocationId: 'loc-1' })
      },
      gbpSyncState: {
        findUnique: jest.fn().mockResolvedValue({
          cooldownUntil: new Date(Date.now() + 5 * 60 * 1000)
        })
      }
    };

    const service = new ReviewsService(prisma as never, queue as never);
    const result = await service.enqueuePoll('tenant-1');

    expect(result.jobId).toBeNull();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
