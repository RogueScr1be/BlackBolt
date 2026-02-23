import { BadRequestException, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { ReviewsService } from './reviews.service';

@Controller('v1/tenants/:tenantId/reviews')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('poll')
  async poll(@Param('tenantId') tenantId: string) {
    return this.reviewsService.enqueuePoll(tenantId);
  }

  @Get()
  async listReviews(
    @Param('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor: string | undefined,
    @Query('since') since: string | undefined
  ) {
    if (since && Number.isNaN(Date.parse(since))) {
      throw new BadRequestException('since must be an ISO date-time string');
    }

    return this.reviewsService.listReviews({
      tenantId,
      limit: Math.max(1, Math.min(limit, 200)),
      cursor,
      since
    });
  }
}
