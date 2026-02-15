import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      ok: true,
      service: 'blackbolt-api',
      version: '1.0.0-phase1'
    };
  }
}
