import { Body, Controller, Post } from '@nestjs/common';
import { SosService } from './sos.service';

@Controller('v1/sos/scheduler')
export class SosSchedulerController {
  constructor(private readonly sosService: SosService) {}

  @Post('followups/run')
  async runFollowupSweep(
    @Body() body: { tenantId?: string; windowStartDays?: number; windowEndDays?: number } | undefined
  ) {
    return this.sosService.runFollowupSweep({
      tenantId: body?.tenantId ?? '',
      windowStartDays: body?.windowStartDays,
      windowEndDays: body?.windowEndDays
    });
  }
}
