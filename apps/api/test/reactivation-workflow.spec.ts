import { ReviewsProcessor } from '../src/modules/reviews/reviews.processor';
import { GBP_PAGE_FETCH_JOB_NAME } from '../src/modules/reviews/reviews.constants';

describe('Reactivation workflow', () => {
  function basePrisma() {
    return {
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
      review: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'review-1' })
      },
      reviewClassification: { upsert: jest.fn().mockResolvedValue({}) },
      tenantPolicy: { findUnique: jest.fn().mockResolvedValue(null) },
      customer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cust-1', segment: 'SEGMENT_90_365' }])
      },
      campaign: {
        create: jest.fn().mockResolvedValue({ id: 'camp-1' })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      },
      draftMessage: {
        create: jest.fn().mockResolvedValue({ id: 'draft-1' })
      },
      approvalItem: {
        upsert: jest.fn().mockResolvedValue({})
      },
      campaignMessage: {
        create: jest.fn().mockResolvedValue({ id: 'cm-1' })
      },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };
  }

  it('auto-path queues postmark send when confidence is high and no risk flags', async () => {
    const prisma = basePrisma();
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
            body: 'Great cleaning service and friendly team with very fast appointment flow and excellent results overall',
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
    const postmarkSendQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const processor = new ReviewsProcessor(
      prisma as never,
      ledger as never,
      gbpClient as never,
      reviewsQueue as never,
      postmarkSendQueue as never
    );

    await processor.process({
      id: 'job-1',
      name: GBP_PAGE_FETCH_JOB_NAME,
      data: { tenantId: 'tenant-1', locationId: 'loc-1', cursor: null, pagesRemaining: 5, deadlineAtEpochMs: Date.now() + 10000 }
    } as never);

    expect(prisma.reviewClassification.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.campaign.create).toHaveBeenCalledTimes(1);
    expect(prisma.campaignMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED'
        })
      })
    );
    expect(postmarkSendQueue.add).toHaveBeenCalledTimes(1);
  });

  it('manual lane when risk flags are detected', async () => {
    const prisma = basePrisma();
    const ledger = {
      createRun: jest.fn().mockResolvedValue({ run: { id: 'run-1' }, created: true }),
      markState: jest.fn().mockResolvedValue({})
    };
    const gbpClient = {
      fetchReviews: jest.fn().mockResolvedValue({
        reviews: [
          {
            sourceReviewId: 'rev-2',
            rating: 5,
            body: 'They guarantee this will cure everything',
            reviewerName: 'Sam',
            reviewedAt: new Date().toISOString(),
            redactedJson: { reviewId: 'rev-2' },
            payloadHash: 'h2'
          }
        ],
        nextPageToken: null
      })
    };
    const reviewsQueue = { enqueuePageFetch: jest.fn() };
    const postmarkSendQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const processor = new ReviewsProcessor(
      prisma as never,
      ledger as never,
      gbpClient as never,
      reviewsQueue as never,
      postmarkSendQueue as never
    );

    await processor.process({
      id: 'job-1',
      name: GBP_PAGE_FETCH_JOB_NAME,
      data: { tenantId: 'tenant-1', locationId: 'loc-1', cursor: null, pagesRemaining: 5, deadlineAtEpochMs: Date.now() + 10000 }
    } as never);

    expect(prisma.reviewClassification.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
    expect(postmarkSendQueue.add).not.toHaveBeenCalled();
  });
});
