import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { RevenueEventKind, RevenueEventSource } from '@prisma/client';
import type { RequestWithContext } from '../../common/request-context';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RevenueService } from './revenue.service';

@Controller('v1/tenants/:tenantId/revenue')
@UseGuards(TenantGuard)
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  @Post('events')
  async createRevenueEvent(
    @Param('tenantId') tenantId: string,
    @Req() req: RequestWithContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body()
    body: {
      occurredAt: string;
      amountCents: number;
      currency: string;
      kind: RevenueEventKind;
      source: RevenueEventSource;
      externalId?: string;
      customerId?: string;
      campaignMessageId?: string;
      linkCode?: string;
      providerMessageId?: string;
      description?: string;
      redactedMetadata?: Record<string, string>;
    }
  ) {
    if (req.tenantId !== tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    if (!/^[A-Za-z0-9:_-]{1,160}$/.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key header is invalid');
    }

    return this.revenueService.createRevenueEvent({
      tenantId,
      idempotencyKey,
      occurredAt: body.occurredAt,
      amountCents: body.amountCents,
      currency: body.currency,
      kind: body.kind,
      source: body.source,
      externalId: body.externalId,
      customerId: body.customerId,
      campaignMessageId: body.campaignMessageId,
      linkCode: body.linkCode,
      providerMessageId: body.providerMessageId,
      description: body.description,
      redactedMetadata: body.redactedMetadata
    });
  }

  @Get('summary')
  async getRevenueSummary(
    @Param('tenantId') tenantId: string,
    @Req() req: RequestWithContext,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    if (req.tenantId !== tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    return this.revenueService.getRevenueSummary({ tenantId, from, to });
  }
}
