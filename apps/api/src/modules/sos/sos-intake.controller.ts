import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { SosService } from './sos.service';
import type { SosCreatePaymentIntentRequest } from './sos.types';

@Controller('v1/sos/intake')
export class SosIntakeController {
  constructor(private readonly sosService: SosService) {}

  @Post('payment-intents')
  @HttpCode(201)
  async createPaymentIntent(@Body() body: SosCreatePaymentIntentRequest) {
    return this.sosService.createPaymentIntent(body);
  }
}
