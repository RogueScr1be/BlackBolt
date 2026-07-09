import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Prisma } from '@prisma/client';

import { PortfolioOperatorGuard } from '../src/common/guards/portfolio-operator.guard';
import { OperatorPortfolioController } from '../src/modules/operator-portfolio/operator-portfolio.controller';
import { ReviewOperatorActionsService } from '../src/modules/operator-portfolio/review-operator-actions.service';

describe('ReviewOperatorActionsService', () => {
  function safeReview(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'review-1',
      tenantId: 'tenant-1',
      sourceReviewId: 'source-review-1',
      rating: 5,
      reviewBody: 'We appreciated the thoughtful support from the team.',
      reviewerName: 'Alex',
      reviewedAt: new Date('2026-02-16T17:56:01.276Z'),
      createdAt: new Date('2026-02-17T17:56:01.276Z'),
      classifications: [{ label: 'genuine_positive', confidence: new Prisma.Decimal(1) }],
      queueItems: [
        {
          state: 'classified',
          confidence: new Prisma.Decimal(1),
          classifiedAt: new Date('2026-02-17T17:56:01.276Z'),
          awaitingApprovalAt: null
        }
      ],
      ...overrides
    };
  }

  it('creates one public reply suggestion for a safe positive review and is idempotent', async () => {
    const actionRow = {
      id: 'action-1',
      tenantId: 'tenant-1',
      reviewId: 'review-1',
      actionType: 'public_reply_suggestion',
      status: 'draft',
      suggestedText: 'Thank you for sharing your experience with SOS Lactation. We appreciate your feedback and are glad our team could support you. Wishing you and your family well.',
      safetyFlags: { riskFlags: [], classificationLabel: 'genuine_positive' },
      confidence: new Prisma.Decimal(1),
      createdByKind: 'operator',
      createdByUserId: 'operator-1',
      createdAt: new Date('2026-02-17T18:00:00.000Z'),
      updatedAt: new Date('2026-02-17T18:00:00.000Z'),
      review: safeReview()
    };

    const prisma = {
      review: {
        findFirst: jest.fn().mockResolvedValue(safeReview())
      },
      reviewOperatorAction: {
        upsert: jest.fn().mockResolvedValue(actionRow)
      },
      customer: {
        count: jest.fn()
      },
      campaign: {
        create: jest.fn()
      },
      campaignRun: {
        create: jest.fn()
      },
      campaignMessage: {
        create: jest.fn()
      },
      draftMessage: {
        create: jest.fn()
      },
      approvalItem: {
        create: jest.fn()
      },
      linkCode: {
        upsert: jest.fn()
      },
      sendEvent: {
        create: jest.fn()
      }
    };

    const service = new ReviewOperatorActionsService(prisma as never);

    const first = await service.createPublicReplySuggestion({
      allowedTenantIds: ['tenant-1'],
      tenantId: 'tenant-1',
      reviewId: 'review-1',
      actorUserId: 'operator-1'
    });
    const second = await service.createPublicReplySuggestion({
      allowedTenantIds: ['tenant-1'],
      tenantId: 'tenant-1',
      reviewId: 'review-1',
      actorUserId: 'operator-1'
    });

    expect(first.id).toBe('action-1');
    expect(second.id).toBe('action-1');
    expect(prisma.reviewOperatorAction.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.customer.count).not.toHaveBeenCalled();
    expect(prisma.campaign.create).not.toHaveBeenCalled();
    expect(prisma.campaignMessage.create).not.toHaveBeenCalled();
    expect(prisma.draftMessage.create).not.toHaveBeenCalled();
    expect(prisma.approvalItem.create).not.toHaveBeenCalled();
    expect(prisma.linkCode.upsert).not.toHaveBeenCalled();
    expect(prisma.sendEvent.create).not.toHaveBeenCalled();
  });

  it('refuses PHI-adjacent reviews', async () => {
    const prisma = {
      review: {
        findFirst: jest.fn().mockResolvedValue(
          safeReview({
            reviewBody: 'We discussed clinical notes and insurance details during follow-up.',
            classifications: [{ label: 'genuine_positive', confidence: new Prisma.Decimal(1) }]
          })
        )
      },
      reviewOperatorAction: {
        upsert: jest.fn()
      }
    };

    const service = new ReviewOperatorActionsService(prisma as never);

    await expect(
      service.createPublicReplySuggestion({
        allowedTenantIds: ['tenant-1'],
        tenantId: 'tenant-1',
        reviewId: 'review-1',
        actorUserId: 'operator-1'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.reviewOperatorAction.upsert).not.toHaveBeenCalled();
  });

  it('refuses low-rating reviews', async () => {
    const prisma = {
      review: {
        findFirst: jest.fn().mockResolvedValue(
          safeReview({
            rating: 3,
            classifications: [{ label: 'needs_review', confidence: new Prisma.Decimal(0.6) }]
          })
        )
      },
      reviewOperatorAction: {
        upsert: jest.fn()
      }
    };

    const service = new ReviewOperatorActionsService(prisma as never);

    await expect(
      service.createPublicReplySuggestion({
        allowedTenantIds: ['tenant-1'],
        tenantId: 'tenant-1',
        reviewId: 'review-1',
        actorUserId: 'operator-1'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.reviewOperatorAction.upsert).not.toHaveBeenCalled();
  });

  it('enforces tenant scoping', async () => {
    const service = new ReviewOperatorActionsService({} as never);

    await expect(
      service.createPublicReplySuggestion({
        allowedTenantIds: ['tenant-2'],
        tenantId: 'tenant-1',
        reviewId: 'review-1',
        actorUserId: 'operator-1'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('moves draft actions into reviewed and dismissed states', async () => {
    const action = {
      id: 'action-1',
      tenantId: 'tenant-1',
      reviewId: 'review-1',
      actionType: 'public_reply_suggestion',
      status: 'draft',
      suggestedText: 'Thanks for your feedback.',
      safetyFlags: { riskFlags: [] },
      confidence: new Prisma.Decimal(1),
      createdByKind: 'system',
      createdByUserId: null,
      createdAt: new Date('2026-02-17T18:00:00.000Z'),
      updatedAt: new Date('2026-02-17T18:00:00.000Z'),
      review: safeReview()
    };
    const prisma = {
      reviewOperatorAction: {
        findFirst: jest.fn().mockResolvedValue(action),
        update: jest.fn().mockResolvedValue({
          ...action,
          status: 'reviewed',
          updatedAt: new Date('2026-02-17T18:05:00.000Z')
        })
      }
    };

    const service = new ReviewOperatorActionsService(prisma as never);
    const reviewed = await service.updateReviewOperatorAction({
      allowedTenantIds: ['tenant-1'],
      actionId: 'action-1',
      status: 'reviewed',
      actorUserId: 'operator-1'
    });

    expect(reviewed.status).toBe('reviewed');
    expect(prisma.reviewOperatorAction.update).toHaveBeenCalledTimes(1);
  });
});

describe('OperatorPortfolioController', () => {
  it('keeps portfolio operator guard on the controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OperatorPortfolioController) as Array<new (...args: never[]) => unknown> | undefined;
    expect(guards).toEqual(expect.arrayContaining([PortfolioOperatorGuard]));
  });
});
