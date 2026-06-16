import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context';
import { AUTHORIZATION_HEADER, POSTMARK_SIGNATURE_HEADER } from './postmark.constants';
import { PostmarkReviewAlertService } from './postmark-review-alert.service';
import { PostmarkService } from './postmark.service';
import { resolvePostmarkWebhookSourceIp } from './postmark.auth';
import type { PostmarkGoogleReviewAlertPayload, PostmarkWebhookPayload } from './postmark.types';

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

@Controller('v1/webhooks')
export class PostmarkController {
  constructor(
    private readonly postmarkService: PostmarkService,
    private readonly reviewAlertService: PostmarkReviewAlertService
  ) {}

  @Post('postmark')
  @HttpCode(200)
  async receivePostmarkWebhook(
    @Req() req: RequestWithContext,
    @Headers(AUTHORIZATION_HEADER) authorizationHeader: string | undefined,
    @Headers(POSTMARK_SIGNATURE_HEADER) signatureHeader: string | undefined,
    @Body() body: PostmarkWebhookPayload
  ) {
    const xForwardedFor = firstHeaderValue(req.headers['x-forwarded-for']);
    const xRealIp = firstHeaderValue(req.headers['x-real-ip']);
    const sourceIpResolution = resolvePostmarkWebhookSourceIp({
      requestIp: req.ip ?? null,
      socketRemoteAddress: req.socket.remoteAddress ?? null,
      xForwardedFor,
      xRealIp,
      trustProxyHeaders: process.env.POSTMARK_WEBHOOK_TRUST_PROXY_HEADERS === '1'
    });

    return this.postmarkService.receiveWebhook({
      authorizationHeader,
      rawBody: req.rawBody,
      signatureHeader,
      sourceIp: sourceIpResolution.sourceIp,
      requestIp: req.ip ?? null,
      sourceIpSource: sourceIpResolution.sourceIpSource,
      proxyHeadersTrusted: sourceIpResolution.proxyHeadersTrusted,
      payload: body
    });
  }

  @Post('postmark/inbound/google-review-alert')
  @HttpCode(200)
  async receiveGoogleReviewAlert(
    @Req() req: RequestWithContext,
    @Headers(AUTHORIZATION_HEADER) authorizationHeader: string | undefined,
    @Headers(POSTMARK_SIGNATURE_HEADER) signatureHeader: string | undefined,
    @Body() body: PostmarkGoogleReviewAlertPayload
  ) {
    const xForwardedFor = firstHeaderValue(req.headers['x-forwarded-for']);
    const xRealIp = firstHeaderValue(req.headers['x-real-ip']);
    const sourceIpResolution = resolvePostmarkWebhookSourceIp({
      requestIp: req.ip ?? null,
      socketRemoteAddress: req.socket.remoteAddress ?? null,
      xForwardedFor,
      xRealIp,
      trustProxyHeaders: process.env.POSTMARK_WEBHOOK_TRUST_PROXY_HEADERS === '1'
    });

    return this.reviewAlertService.receiveGoogleReviewAlert({
      authorizationHeader,
      rawBody: req.rawBody,
      signatureHeader,
      requestIp: req.ip ?? null,
      sourceIp: sourceIpResolution.sourceIp,
      resolvedSourceIp: sourceIpResolution.sourceIp,
      sourceIpSource: sourceIpResolution.sourceIpSource,
      proxyHeadersTrusted: sourceIpResolution.proxyHeadersTrusted,
      socketRemoteAddress: req.socket.remoteAddress ?? null,
      xForwardedFor,
      xRealIp,
      payload: body
    });
  }
}
