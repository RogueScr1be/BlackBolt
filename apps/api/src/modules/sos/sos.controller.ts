import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { STRIPE_SIGNATURE_HEADER } from './sos.constants';
import { SosService } from './sos.service';
import type { StripeEventPayload } from './sos.types';

@Controller('v1/webhooks')
export class SosController {
  constructor(private readonly sosService: SosService) {}

  @Post('stripe')
  @HttpCode(200)
  async receiveStripeWebhook(
    @Req() req: RequestWithContext,
    @Headers(STRIPE_SIGNATURE_HEADER) signatureHeader: string | undefined,
    @Body() body: StripeEventPayload
  ) {
    return this.sosService.receiveStripeWebhook({
      signatureHeader,
      rawBody: req.rawBody,
      payload: body
    });
  }
}
