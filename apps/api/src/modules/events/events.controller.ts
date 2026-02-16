import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async getEvents(@Req() req: RequestWithContext, @Query('since') since?: string) {
    return this.eventsService.listEvents({ tenantId: req.tenantId!, since });
  }
}
