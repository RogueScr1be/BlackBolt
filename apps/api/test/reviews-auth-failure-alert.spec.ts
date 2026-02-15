import { ReviewsProcessor } from '../src/modules/reviews/reviews.processor';
import { GbpPermanentAuthError } from '../src/modules/gbp/gbp.constants';
import { GBP_PAGE_FETCH_JOB_NAME } from '../src/modules/reviews/reviews.constants';

describe('GBP auth failure terminal behavior', () => {
  it('writes alert, sets NEEDS_REAUTH, and marks run dead_lettered', async () => {
    const tenantUpdate = jest.fn().mockResolvedValue({});

    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          gbpAccountId: 'acct-1',
          gbpLocationId: 'loc-1',
          gbpAccessTokenRef: 'tok-ref-1',
          gbpIntegrationStatus: 'CONNECTED'
        }),
        update: tenantUpdate
      },
      gbpSyncState: {
        upsert: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          nextPageToken: null,
          cooldownUntil: null,
          lastSeenReviewAt: null
        }),
        update: jest.fn().mockResolvedValue({})
      },
      review: { upsert: jest.fn() },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };

    const ledger = {
      createRun: jest.fn().mockResolvedValue({ run: { id: 'run-1' }, created: true }),
      markState: jest.fn().mockResolvedValue({})
    };

    const gbpClient = {
      fetchReviews: jest.fn().mockRejectedValue(new GbpPermanentAuthError('auth revoked'))
    };

    const reviewsQueue = { enqueuePageFetch: jest.fn() };
    const processor = new ReviewsProcessor(prisma as never, ledger as never, gbpClient as never, reviewsQueue as never);
    const job = {
      id: 'gbp-ingest:tenant-1:loc-1:start:v1',
      name: GBP_PAGE_FETCH_JOB_NAME,
      data: { tenantId: 'tenant-1', locationId: 'loc-1', cursor: null, pagesRemaining: 5, deadlineAtEpochMs: Date.now() + 10_000 }
    };

    await processor.process(job as never);

    expect(prisma.integrationAlert.create).toHaveBeenCalled();
    expect(tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gbpIntegrationStatus: 'NEEDS_REAUTH' })
      })
    );
    expect(ledger.markState).toHaveBeenCalledWith(
      'run-1',
      'dead_lettered',
      'GBP_AUTH_REVOKED',
      'auth revoked',
      expect.objectContaining({ error_class: 'AUTH_REVOKED' })
    );
  });
});
