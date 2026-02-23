import { BadRequestException } from '@nestjs/common';
import { OperatorPortfolioService } from '../src/modules/operator-portfolio/operator-portfolio.service';

describe('OperatorPortfolioService', () => {
  function queuedApproval() {
    return {
      id: 'approval-1',
      tenantId: 'tenant-1',
      campaignRunId: 'run-1',
      status: 'queued',
      subjectLine: 'Thanks for your review',
      bodyText: 'Trust signal: Thank you.\nSingle CTA: Book your next visit.',
      segmentMode: 'last_seen_90_365',
      sendWindowAt: new Date('2026-02-22T10:00:00.000Z'),
      requiredRole: 'OPERATOR',
      approvedAt: null,
      rejectedAt: null,
      createdAt: new Date('2026-02-21T00:00:00.000Z'),
      updatedAt: new Date('2026-02-21T00:00:00.000Z'),
      draftMessageId: 'draft-1',
      draftMessage: {
        id: 'draft-1',
        bodyText: 'Subject: Thanks for your review\n\nTrust signal: Thank you.',
        reviewId: 'review-1'
      },
      campaignRun: {
        id: 'run-1',
        campaignId: 'camp-1',
        triggerReviewId: 'review-1',
        status: 'PAUSED',
        segmentMode: 'default',
        sendWindowAt: new Date('2026-02-22T10:00:00.000Z')
      }
    };
  }

  it('approves queued approval and materializes queued campaign messages', async () => {
    const approval = queuedApproval();
    const tx = {
      customer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cust-1' }, { id: 'cust-2' }])
      },
      campaignMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValueOnce({ id: 'msg-1' }).mockResolvedValueOnce({ id: 'msg-2' })
      },
      linkCode: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({})
      },
      draftMessage: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({ id: 'draft-1' }),
        create: jest.fn().mockResolvedValue({ id: 'draft-2' })
      },
      approvalItem: {
        update: jest.fn().mockResolvedValue({})
      },
      campaignRun: {
        update: jest.fn().mockResolvedValue({})
      },
      reviewQueueItem: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const prisma = {
      approvalItem: {
        findFirst: jest.fn().mockResolvedValue(approval)
      },
      tenantPolicy: {
        findUnique: jest.fn().mockResolvedValue({ policyJson: { maxRecipients: 10, segmentMode: 'default' } })
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ timeZone: 'UTC' })
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    };

    const service = new OperatorPortfolioService(prisma as never);
    const result = await service.approveApproval({
      allowedTenantIds: ['tenant-1'],
      approvalId: 'approval-1',
      actorUserId: 'operator'
    });

    expect(result.ok).toBe(true);
    expect(result.queued_count).toBe(2);
    expect(tx.campaignMessage.create).toHaveBeenCalledTimes(2);
    expect(tx.approvalItem.update).toHaveBeenCalledTimes(1);
  });

  it('rejects patch when draft contains blocked patterns', async () => {
    const approval = queuedApproval();
    const prisma = {
      approvalItem: {
        findFirst: jest.fn().mockResolvedValue(approval)
      }
    };
    const service = new OperatorPortfolioService(prisma as never);

    await expect(
      service.patchApprovalDraft({
        allowedTenantIds: ['tenant-1'],
        approvalId: 'approval-1',
        actorUserId: 'operator',
        subject: 'Huge amazing deal',
        body: 'Book now 😊'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
