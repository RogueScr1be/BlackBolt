import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ReviewsService } from './reviews.service';

@Controller('v1/tenants/:tenantId/reviews')
@UseGuards(TenantGuard)
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
    @Query('cursor') cursor: string | undefined
  ) {
    return this.reviewsService.listReviews({
      tenantId,
      limit: Math.max(1, Math.min(limit, 200)),
      cursor
    });
  }
}
