import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsQueue } from './reviews.queue';
import { GBP_SOURCE } from '../gbp/gbp.constants';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewsQueue: ReviewsQueue
  ) {}

  async enqueuePoll(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, gbpLocationId: true }
    });

    if (!tenant || !tenant.gbpLocationId) {
      throw new NotFoundException('GBP integration not configured for tenant');
    }

    const syncState = await this.prisma.gbpSyncState.findUnique({
      where: {
        tenantId_locationId: {
          tenantId,
          locationId: tenant.gbpLocationId
        }
      }
    });

    if (syncState?.cooldownUntil && syncState.cooldownUntil.getTime() > Date.now()) {
      return {
        queue: 'gbp.ingest',
        jobId: null,
        cooldownUntil: syncState.cooldownUntil
      };
    }

    const job = await this.reviewsQueue.enqueuePollTrigger({
      tenantId,
      locationId: tenant.gbpLocationId
    });

    return {
      queue: 'gbp.ingest',
      jobId: job.jobId,
      cooldownUntil: null
    };
  }

  async listReviews(input: {
    tenantId: string;
    limit: number;
    cursor?: string;
  }) {
    const rows = await this.prisma.review.findMany({
      where: {
        tenantId: input.tenantId,
        source: GBP_SOURCE
      },
      take: input.limit + 1,
      ...(input.cursor
        ? {
            cursor: { id: input.cursor },
            skip: 1
          }
        : {}),
      orderBy: { id: 'asc' }
    });

    const hasNext = rows.length > input.limit;
    const items = hasNext ? rows.slice(0, input.limit) : rows;

    return {
      items: items.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        source: item.source,
        sourceReviewId: item.sourceReviewId,
        rating: item.rating,
        body: item.reviewBody,
        reviewerName: item.reviewerName,
        reviewedAt: item.reviewedAt,
        createdAt: item.createdAt
      })),
      nextCursor: hasNext ? items[items.length - 1]?.id ?? null : null
    };
  }
}
