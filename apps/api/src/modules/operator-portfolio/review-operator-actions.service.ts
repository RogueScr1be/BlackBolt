import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ReviewOperatorAction as ReviewOperatorActionRow } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { classifyReview, detectRiskFlags } from '../reviews/reactivation.workflow';

export const REVIEW_OPERATOR_ACTION_TYPE = 'public_reply_suggestion' as const;
export const REVIEW_OPERATOR_ACTION_STATUSES = ['draft', 'reviewed', 'dismissed'] as const;
export type ReviewOperatorActionStatus = (typeof REVIEW_OPERATOR_ACTION_STATUSES)[number];

type ReviewClassificationSnapshot = {
  label: string;
  confidence: Prisma.Decimal;
};

type ReviewActionReviewSnapshot = {
  id: string;
  tenantId: string;
  sourceReviewId: string;
  rating: number | null;
  reviewBody: string | null;
  reviewerName: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  classifications: ReviewClassificationSnapshot[];
  queueItems: Array<{
    state: string;
    confidence: Prisma.Decimal;
    classifiedAt: Date | null;
    awaitingApprovalAt: Date | null;
  }>;
};

type ReviewOperatorActionRecord = ReviewOperatorActionRow & {
  review?: ReviewActionReviewSnapshot | null;
};

@Injectable()
export class ReviewOperatorActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listReviewOperatorActions(input: {
    allowedTenantIds: string[];
    tenantId?: string;
    status?: string;
  }) {
    const tenantId = this.resolveTenantScope(input.allowedTenantIds, input.tenantId);
    const status = this.normalizeStatus(input.status);

    const rows = await this.prisma.reviewOperatorAction.findMany({
      where: {
        tenantId: tenantId ? tenantId : { in: input.allowedTenantIds },
        ...(status ? { status } : {}),
        actionType: REVIEW_OPERATOR_ACTION_TYPE
      },
      include: {
        review: {
          select: {
            id: true,
            tenantId: true,
            sourceReviewId: true,
            rating: true,
            reviewBody: true,
            reviewerName: true,
            reviewedAt: true,
            createdAt: true,
            classifications: {
              select: {
                label: true,
                confidence: true
              },
              orderBy: { createdAt: 'desc' },
              take: 1
            },
            queueItems: {
              select: {
                state: true,
                confidence: true,
                classifiedAt: true,
                awaitingApprovalAt: true
              },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 300
    });

    return {
      items: rows.map((row) => this.mapAction(row))
    };
  }

  async createPublicReplySuggestion(input: {
    allowedTenantIds: string[];
    tenantId: string;
    reviewId: string;
    actorUserId: string | null;
  }) {
    this.assertAllowedTenant(input.allowedTenantIds, input.tenantId);
    const review = await this.findScopedReview(input.tenantId, input.reviewId);
    const classification = review.classifications[0] ?? null;

    this.assertEligibleReview(review, classification);

    const suggestedText = this.buildSuggestedReply();
    const riskFlags = detectRiskFlags(review.reviewBody ?? '');
    const safetyFlags = {
      riskFlags,
      classificationLabel: classification?.label ?? null,
      queueState: review.queueItems[0]?.state ?? null,
      reviewRating: review.rating,
      reviewedAt: review.reviewedAt?.toISOString() ?? null
    };
    const confidence = classification?.confidence ?? new Prisma.Decimal(review.rating === 5 ? 1 : 0.8);
    const createdByKind = input.actorUserId ? 'operator' : 'system';

    const action = await this.prisma.reviewOperatorAction.upsert({
      where: {
        tenantId_reviewId_actionType: {
          tenantId: input.tenantId,
          reviewId: review.id,
          actionType: REVIEW_OPERATOR_ACTION_TYPE
        }
      },
      update: {},
      create: {
        tenantId: input.tenantId,
        reviewId: review.id,
        actionType: REVIEW_OPERATOR_ACTION_TYPE,
        status: 'draft',
        suggestedText,
        safetyFlags: safetyFlags as Prisma.InputJsonValue,
        confidence,
        createdByKind,
        createdByUserId: input.actorUserId
      }
    });

    return this.mapAction({
      ...action,
      review
    });
  }

  async updateReviewOperatorAction(input: {
    allowedTenantIds: string[];
    actionId: string;
    status: ReviewOperatorActionStatus;
    actorUserId: string | null;
  }) {
    const action = await this.findScopedAction(input.allowedTenantIds, input.actionId);
    if (action.actionType !== REVIEW_OPERATOR_ACTION_TYPE) {
      throw new BadRequestException('Unsupported operator action type');
    }

    if (action.status !== 'draft' && action.status !== input.status) {
      throw new BadRequestException('Action is closed');
    }

    if (action.status === input.status) {
      return this.mapAction(action);
    }

    const updated = await this.prisma.reviewOperatorAction.update({
      where: { id: action.id },
      data: {
        status: input.status,
        createdByKind: action.createdByKind,
        createdByUserId: action.createdByUserId ?? input.actorUserId ?? null
      },
      include: {
        review: {
          select: {
            id: true,
            tenantId: true,
            sourceReviewId: true,
            rating: true,
            reviewBody: true,
            reviewerName: true,
            reviewedAt: true,
            createdAt: true,
            classifications: {
              select: {
                label: true,
                confidence: true
              },
              orderBy: { createdAt: 'desc' },
              take: 1
            },
            queueItems: {
              select: {
                state: true,
                confidence: true,
                classifiedAt: true,
                awaitingApprovalAt: true
              },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    return this.mapAction(updated);
  }

  private mapAction(row: ReviewOperatorActionRecord) {
    const review = row.review ?? null;
    const classification = review?.classifications[0] ?? null;
    const queueItem = review?.queueItems[0] ?? null;
    return {
      id: row.id,
      tenant_id: row.tenantId,
      review_id: row.reviewId,
      action_type: row.actionType,
      status: row.status,
      suggested_text: row.suggestedText,
      safety_flags: row.safetyFlags,
      confidence: row.confidence === null ? null : Number(row.confidence),
      created_by_kind: row.createdByKind,
      created_by_user_id: row.createdByUserId,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      review: review
        ? {
            id: review.id,
            tenant_id: review.tenantId,
            source_review_id: review.sourceReviewId,
            rating: review.rating,
            reviewed_at: review.reviewedAt?.toISOString() ?? null,
            created_at: review.createdAt.toISOString(),
            classification_label: classification?.label ?? null,
            classification_confidence: classification?.confidence === undefined ? null : Number(classification.confidence),
            queue_state: queueItem?.state ?? null,
            queue_confidence: queueItem?.confidence === undefined ? null : Number(queueItem.confidence),
            classified_at: queueItem?.classifiedAt?.toISOString() ?? null,
            awaiting_approval_at: queueItem?.awaitingApprovalAt?.toISOString() ?? null
          }
        : null
    };
  }

  private buildSuggestedReply(): string {
    return [
      'Thank you for sharing your experience with SOS Lactation.',
      'We appreciate your feedback and are glad our team could support you.',
      'Wishing you and your family well.'
    ].join(' ');
  }

  private assertEligibleReview(
    review: ReviewActionReviewSnapshot,
    classification: ReviewClassificationSnapshot | null
  ) {
    if (!classification || classification.label !== 'genuine_positive') {
      throw new BadRequestException('Review is not eligible for a public reply suggestion');
    }

    if (review.rating === null || review.rating < 4) {
      throw new BadRequestException('Review rating is too low for a public reply suggestion');
    }

    const riskFlags = detectRiskFlags(review.reviewBody ?? '');
    if (riskFlags.length > 0) {
      throw new BadRequestException('Review is not eligible for a public reply suggestion');
    }
  }

  private async findScopedReview(tenantId: string, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: {
        id: reviewId,
        tenantId
      },
      select: {
        id: true,
        tenantId: true,
        sourceReviewId: true,
        rating: true,
        reviewBody: true,
        reviewerName: true,
        reviewedAt: true,
        createdAt: true,
        classifications: {
          select: {
            label: true,
            confidence: true
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        queueItems: {
          select: {
            state: true,
            confidence: true,
            classifiedAt: true,
            awaitingApprovalAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  private async findScopedAction(allowedTenantIds: string[], actionId: string) {
    const action = await this.prisma.reviewOperatorAction.findFirst({
      where: {
        id: actionId,
        tenantId: { in: allowedTenantIds }
      },
      include: {
        review: {
          select: {
            id: true,
            tenantId: true,
            sourceReviewId: true,
            rating: true,
            reviewBody: true,
            reviewerName: true,
            reviewedAt: true,
            createdAt: true,
            classifications: {
              select: {
                label: true,
                confidence: true
              },
              orderBy: { createdAt: 'desc' },
              take: 1
            },
            queueItems: {
              select: {
                state: true,
                confidence: true,
                classifiedAt: true,
                awaitingApprovalAt: true
              },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    if (!action) {
      throw new NotFoundException('Review operator action not found');
    }

    return action as ReviewOperatorActionRecord;
  }

  private assertAllowedTenant(allowedTenantIds: string[], tenantId: string) {
    if (!allowedTenantIds.includes(tenantId)) {
      throw new ForbiddenException('Tenant not allowed');
    }
  }

  private resolveTenantScope(allowedTenantIds: string[], tenantId?: string) {
    if (!tenantId) {
      return null;
    }
    this.assertAllowedTenant(allowedTenantIds, tenantId);
    return tenantId;
  }

  private normalizeStatus(status?: string): ReviewOperatorActionStatus | null {
    if (!status || status === 'all') {
      return null;
    }
    if ((REVIEW_OPERATOR_ACTION_STATUSES as readonly string[]).includes(status)) {
      return status as ReviewOperatorActionStatus;
    }
    throw new BadRequestException('status must be draft, reviewed, dismissed, or all');
  }
}
