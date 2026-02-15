import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { AUTHORIZATION_HEADER, POSTMARK_SIGNATURE_HEADER } from './postmark.constants';
import { PostmarkService } from './postmark.service';
import type { PostmarkWebhookPayload } from './postmark.types';

@Controller('v1/webhooks')
export class PostmarkController {
  constructor(private readonly postmarkService: PostmarkService) {}

  @Post('postmark')
  @HttpCode(200)
  async receivePostmarkWebhook(
    @Req() req: RequestWithContext,
    @Headers(AUTHORIZATION_HEADER) authorizationHeader: string | undefined,
    @Headers(POSTMARK_SIGNATURE_HEADER) signatureHeader: string | undefined,
    @Body() body: PostmarkWebhookPayload
  ) {
    return this.postmarkService.receiveWebhook({
      authorizationHeader,
      rawBody: req.rawBody,
      signatureHeader,
      sourceIp: req.ip ?? null,
      payload: body
    });
  }
}
