import { ReviewsQueue } from '../src/modules/reviews/reviews.queue';
import {
  GBP_PAGE_FETCH_JOB_NAME,
  GBP_POLL_SCHEDULER_JOB_NAME,
  GBP_POLL_TRIGGER_JOB_NAME
} from '../src/modules/reviews/reviews.constants';

describe('ReviewsQueue BullMQ job ids', () => {
  it('uses hash-based job ids without colons for poll trigger, scheduler, and page fetch jobs', async () => {
    const add = jest
      .fn()
      .mockResolvedValueOnce({ id: 'bull-job-1' })
      .mockResolvedValueOnce({ id: 'bull-job-2' })
      .mockResolvedValueOnce({ id: 'bull-job-3' });
    const queue = { add };
    const reviewsQueue = new ReviewsQueue(queue as never);

    const triggerResult = await reviewsQueue.enqueuePollTrigger({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      timeBucket: '2026-07-08T20'
    });
    const schedulerResult = await reviewsQueue.enqueueSchedulerTick();
    const pageResult = await reviewsQueue.enqueuePageFetch({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      cursor: 'cursor-1',
      pagesRemaining: 2,
      deadlineAtEpochMs: Date.now() + 60_000
    });

    expect(triggerResult.jobId).toBe('bull-job-1');
    expect(schedulerResult.jobId).toBe('bull-job-2');
    expect(pageResult.jobId).toBe('bull-job-3');

    expect(add).toHaveBeenNthCalledWith(
      1,
      GBP_POLL_TRIGGER_JOB_NAME,
      expect.objectContaining({
        tenantId: 'tenant-1',
        locationId: 'location-1',
        timeBucket: '2026-07-08T20'
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^[^:]+$/)
      })
    );
    expect(add).toHaveBeenNthCalledWith(
      2,
      GBP_POLL_SCHEDULER_JOB_NAME,
      expect.objectContaining({
        tenantId: 'scheduler',
        locationId: 'scheduler'
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^[^:]+$/)
      })
    );
    expect(add).toHaveBeenNthCalledWith(
      3,
      GBP_PAGE_FETCH_JOB_NAME,
      expect.objectContaining({
        tenantId: 'tenant-1',
        locationId: 'location-1',
        cursor: 'cursor-1',
        pagesRemaining: 2
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^[^:]+$/)
      })
    );
  });
});
