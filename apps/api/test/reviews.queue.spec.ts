import { createHash } from 'node:crypto';

import { ReviewsQueue } from '../src/modules/reviews/reviews.queue';
import {
  GBP_PAGE_FETCH_JOB_NAME,
  GBP_POLL_TRIGGER_JOB_NAME
} from '../src/modules/reviews/reviews.constants';

function expectedBullJobId(jobName: string, idempotencyKey: string): string {
  return `${jobName}-${createHash('sha256').update(idempotencyKey).digest('hex')}`;
}

describe('ReviewsQueue', () => {
  it('uses a colon-free BullMQ job id for poll triggers', async () => {
    const add = jest.fn().mockImplementation(async (_name, _data, opts) => ({ id: opts.jobId } as never));
    const queue = new ReviewsQueue({ add } as never);

    const result = await queue.enqueuePollTrigger({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      timeBucket: '2026-01-01T10',
      delayMs: 0
    });

    const idempotencyKey = 'gbp-ingest:tenant-1:loc-1:2026-01-01T10';
    const jobId = expectedBullJobId(GBP_POLL_TRIGGER_JOB_NAME, idempotencyKey);

    expect(add).toHaveBeenCalledWith(
      GBP_POLL_TRIGGER_JOB_NAME,
      expect.objectContaining({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        timeBucket: '2026-01-01T10'
      }),
      expect.objectContaining({ jobId })
    );
    expect(result).toEqual({ idempotencyKey, jobId });
    expect(result.jobId).not.toContain(':');
  });

  it('uses a colon-free BullMQ job id for page fetch jobs', async () => {
    const add = jest.fn().mockImplementation(async (_name, _data, opts) => ({ id: opts.jobId } as never));
    const queue = new ReviewsQueue({ add } as never);

    const result = await queue.enqueuePageFetch({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      cursor: 'next-cursor',
      pagesRemaining: 4,
      deadlineAtEpochMs: Date.now() + 1000
    });

    const cursorHash = createHash('sha256').update('next-cursor').digest('hex').slice(0, 16);
    const idempotencyKey = `gbp-ingest:tenant-1:loc-1:${cursorHash}:v2`;
    const jobId = expectedBullJobId(GBP_PAGE_FETCH_JOB_NAME, idempotencyKey);

    expect(add).toHaveBeenCalledWith(
      GBP_PAGE_FETCH_JOB_NAME,
      expect.objectContaining({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        cursor: 'next-cursor',
        pagesRemaining: 4
      }),
      expect.objectContaining({ jobId })
    );
    expect(result.idempotencyKey).toBe(idempotencyKey);
    expect(result.jobId).toBe(jobId);
    expect(result.jobId).not.toContain(':');
  });
});
