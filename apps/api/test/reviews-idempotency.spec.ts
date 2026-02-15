import { ReviewsProcessor } from '../src/modules/reviews/reviews.processor';
import { GBP_PAGE_FETCH_JOB_NAME, GBP_POLL_TRIGGER_JOB_NAME } from '../src/modules/reviews/reviews.constants';

describe('GBP review ingestion idempotency and paging', () => {
  it('dedupes poll trigger jobs by time bucket', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', gbpLocationId: 'loc-1' })
      },
      gbpSyncState: {
        upsert: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          nextPageToken: null,
          cooldownUntil: null
        })
      }
    };

    const ledger = {
      createRun: jest
        .fn()
        .mockResolvedValueOnce({ run: { id: 'run-1' }, created: true })
        .mockResolvedValueOnce({ run: { id: 'run-1' }, created: false }),
      markState: jest.fn().mockResolvedValue({})
    };

    const gbpClient = { fetchReviews: jest.fn() };
    const reviewsQueue = {
      enqueuePageFetch: jest.fn().mockResolvedValue({ jobId: 'page-job-1' })
    };

    const processor = new ReviewsProcessor(prisma as never, ledger as never, gbpClient as never, reviewsQueue as never);
    const job = {
      id: 'gbp-ingest:tenant-1:loc-1:2026-01-01T10',
      name: GBP_POLL_TRIGGER_JOB_NAME,
      data: { tenantId: 'tenant-1', locationId: 'loc-1', timeBucket: '2026-01-01T10' }
    };

    await processor.process(job as never);
    await processor.process(job as never);

    expect(reviewsQueue.enqueuePageFetch).toHaveBeenCalledTimes(1);
  });

  it('dedupes page jobs by cursor idempotency key', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          gbpAccountId: 'acct-1',
          gbpLocationId: 'loc-1',
          gbpAccessTokenRef: 'tok-ref-1',
          gbpIntegrationStatus: 'CONNECTED'
        }),
        update: jest.fn().mockResolvedValue({})
      },
      gbpSyncState: {
        upsert: jest.fn().mockResolvedValue({})
      },
      review: { upsert },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };

    const ledger = {
      createRun: jest
        .fn()
        .mockResolvedValueOnce({ run: { id: 'run-1' }, created: true })
        .mockResolvedValueOnce({ run: { id: 'run-1' }, created: false }),
      markState: jest.fn().mockResolvedValue({})
    };

    const gbpClient = {
      fetchReviews: jest.fn().mockResolvedValue({
        reviews: [
          {
            sourceReviewId: 'rev-1',
            rating: 5,
            body: 'Great service',
            reviewerName: 'Alex',
            reviewedAt: new Date().toISOString(),
            redactedJson: { reviewId: 'rev-1' },
            payloadHash: 'h1'
          }
        ],
        nextPageToken: null
      })
    };

    const reviewsQueue = { enqueuePageFetch: jest.fn() };
    const processor = new ReviewsProcessor(prisma as never, ledger as never, gbpClient as never, reviewsQueue as never);

    const job = {
      id: 'gbp-ingest:tenant-1:loc-1:cursorhash:v1',
      name: GBP_PAGE_FETCH_JOB_NAME,
      data: { tenantId: 'tenant-1', locationId: 'loc-1', cursor: null, pagesRemaining: 5, deadlineAtEpochMs: Date.now() + 1000 }
    };

    await processor.process(job as never);
    await processor.process(job as never);

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('processes one page then enqueues the next cursor page', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const syncStateUpsert = jest.fn().mockResolvedValue({});
    const enqueuePageFetch = jest.fn().mockResolvedValue({ jobId: 'page-job-2' });
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          gbpAccountId: 'acct-1',
          gbpLocationId: 'loc-1',
          gbpAccessTokenRef: 'tok-ref-1',
          gbpIntegrationStatus: 'CONNECTED'
        }),
        update: jest.fn().mockResolvedValue({})
      },
      gbpSyncState: {
        upsert: syncStateUpsert
      },
      review: { upsert },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };

    const ledger = {
      createRun: jest.fn().mockResolvedValue({ run: { id: 'run-1' }, created: true }),
      markState: jest.fn().mockResolvedValue({})
    };

    const gbpClient = {
      fetchReviews: jest.fn().mockResolvedValue({
        reviews: [
          {
            sourceReviewId: 'rev-1',
            rating: 5,
            body: 'Great service',
            reviewerName: 'Alex',
            reviewedAt: new Date().toISOString(),
            redactedJson: { reviewId: 'rev-1' },
            payloadHash: 'h1'
          }
        ],
        nextPageToken: 'next-cursor'
      })
    };

    const reviewsQueue = { enqueuePageFetch };
    const processor = new ReviewsProcessor(prisma as never, ledger as never, gbpClient as never, reviewsQueue as never);
    const job = {
      id: 'gbp-ingest:tenant-1:loc-1:start:v1',
      name: GBP_PAGE_FETCH_JOB_NAME,
      data: { tenantId: 'tenant-1', locationId: 'loc-1', cursor: null, pagesRemaining: 5, deadlineAtEpochMs: Date.now() + 30_000 }
    };

    await processor.process(job as never);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(ledger.markState).toHaveBeenCalledWith(
      'run-1',
      'succeeded',
      undefined,
      undefined,
      expect.objectContaining({
        pages_fetched: 1,
        reviews_fetched: 1,
        upserted: 1,
        skipped: 0,
        cooldown_applied: false,
        error_class: null
      })
    );
    expect(syncStateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          nextPageToken: 'next-cursor'
        })
      })
    );
    expect(enqueuePageFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: 'next-cursor',
        pagesRemaining: 4
      })
    );
  });
});
