import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PostmarkReviewAlertService } from '../src/modules/postmark/postmark-review-alert.service';

function sign(raw: Buffer, secret: string) {
  return createHmac('sha256', secret).update(raw).digest('base64');
}

function authHeader() {
  return `Basic ${Buffer.from('postmark:webhook-secret').toString('base64')}`;
}

describe('Postmark review alert inbound adapter', () => {
  const secret = 'postmark-test-secret';

  beforeEach(() => {
    process.env.POSTMARK_WEBHOOK_SECRET = secret;
    process.env.POSTMARK_WEBHOOK_BASIC_AUTH = 'postmark:webhook-secret';
    process.env.REVIEW_ALERT_INBOUND_ENABLED = '1';
    process.env.REVIEW_ALERT_INBOUND_TENANT_ID = 'cmoybzkon0000tm3wj7ofru4n';
    process.env.REVIEW_ALERT_ALLOWED_FROM_DOMAINS = 'google.com,googlebusinessprofile-noreply@google.com';
    delete process.env.REVIEW_ALERT_ALLOWED_RECIPIENT;
  });

  afterEach(() => {
    delete process.env.POSTMARK_WEBHOOK_SECRET;
    delete process.env.POSTMARK_WEBHOOK_BASIC_AUTH;
    delete process.env.REVIEW_ALERT_INBOUND_ENABLED;
    delete process.env.REVIEW_ALERT_INBOUND_TENANT_ID;
    delete process.env.REVIEW_ALERT_ALLOWED_FROM_DOMAINS;
    delete process.env.REVIEW_ALERT_ALLOWED_RECIPIENT;
  });

  function buildService(overrides?: {
    reviewAlertEmail?: {
      findFirst?: jest.Mock;
      count?: jest.Mock;
      create?: jest.Mock;
    };
  }) {
    const prisma: Record<string, unknown> = {
      reviewAlertEmail: {
        findFirst: overrides?.reviewAlertEmail?.findFirst ?? jest.fn().mockResolvedValue(null),
        count: overrides?.reviewAlertEmail?.count ?? jest.fn().mockResolvedValue(0),
        create: overrides?.reviewAlertEmail?.create ?? jest.fn().mockResolvedValue({ id: 'alert-1' })
      },
      integrationAlert: {
        create: jest.fn().mockResolvedValue({ id: 'integration-alert-1' })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      },
      review: { create: jest.fn() },
      customer: { create: jest.fn() },
      campaign: { create: jest.fn() },
      campaignRun: { create: jest.fn() },
      draftMessage: { create: jest.fn() },
      approvalItem: { create: jest.fn() },
      linkCode: { upsert: jest.fn() },
      sendEvent: { upsert: jest.fn() },
      reviewQueueItem: { upsert: jest.fn() },
      campaignMessage: { create: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: never) => Promise<unknown>) => callback(prisma as never))
    };
    const limiter = { consume: jest.fn().mockReturnValue(true) };
    const service = new PostmarkReviewAlertService(prisma as never, limiter as never);
    return { service, prisma };
  }

  it('accepts a valid Google review notification fixture and creates only shadow records', async () => {
    const { service, prisma } = buildService();
    const payload = {
      MessageID: 'msg-1',
      From: 'Google Business Profile <googlebusinessprofile-noreply@google.com>',
      To: 'sos-reviews@blackbolt.test',
      Subject: 'New review from Alex',
      TextBody: 'Alex rated you 5 stars. “Great care and fast follow-up.” Review link: https://www.google.com/maps?cid=123',
      ReceivedAt: '2026-06-09T10:00:00.000Z'
    };
    const raw = Buffer.from(JSON.stringify(payload));

    const result = await service.receiveGoogleReviewAlert({
      authorizationHeader: authHeader(),
      rawBody: raw,
      signatureHeader: sign(raw, secret),
      sourceIp: '1.1.1.1',
      payload
    });

    expect(result.accepted).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.parsedStatus).toBe('parsed');
    expect((prisma.reviewAlertEmail as { create: jest.Mock }).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'google_email_alert',
          provider: 'POSTMARK',
          parsedStatus: 'parsed',
          parsedRating: 5,
          parsedReviewerName: 'Alex',
          parsedReviewSnippet: expect.stringContaining('Great care and fast follow-up'),
          parsedReviewUrl: expect.stringContaining('google.com')
        })
      })
    );
    expect((prisma.integrationAlert as { create: jest.Mock }).create).toHaveBeenCalledTimes(1);
    expect((prisma.auditLog as { create: jest.Mock }).create).toHaveBeenCalledTimes(1);
    expect((prisma.review as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.customer as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.campaign as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.campaignRun as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.draftMessage as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.approvalItem as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.linkCode as { upsert: jest.Mock }).upsert).not.toHaveBeenCalled();
    expect((prisma.sendEvent as { upsert: jest.Mock }).upsert).not.toHaveBeenCalled();
    expect((prisma.reviewQueueItem as { upsert: jest.Mock }).upsert).not.toHaveBeenCalled();
    expect((prisma.campaignMessage as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it('dedupes duplicate forwarded email', async () => {
    const { service, prisma } = buildService({
      reviewAlertEmail: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-1' })
      }
    });
    const payload = {
      MessageID: 'msg-dup',
      From: 'Google Business Profile <googlebusinessprofile-noreply@google.com>',
      To: 'sos-reviews@blackbolt.test',
      Subject: 'New review from Alex',
      TextBody: 'Alex rated you 5 stars. Review link: https://www.google.com/maps?cid=123',
      ReceivedAt: '2026-06-09T10:00:00.000Z'
    };
    const raw = Buffer.from(JSON.stringify(payload));

    const result = await service.receiveGoogleReviewAlert({
      authorizationHeader: authHeader(),
      rawBody: raw,
      signatureHeader: sign(raw, secret),
      sourceIp: '1.1.1.1',
      payload
    });

    expect(result.duplicate).toBe(true);
    expect((prisma.reviewAlertEmail as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.integrationAlert as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.auditLog as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it('quarantines unknown sender', async () => {
    const { service, prisma } = buildService();
    const payload = {
      MessageID: 'msg-unknown',
      From: 'Some sender <alerts@example.com>',
      To: 'sos-reviews@blackbolt.test',
      Subject: 'New review from Alex',
      TextBody: 'Alex rated you 5 stars. Review link: https://www.google.com/maps?cid=123',
      ReceivedAt: '2026-06-09T10:00:00.000Z'
    };
    const raw = Buffer.from(JSON.stringify(payload));

    const result = await service.receiveGoogleReviewAlert({
      authorizationHeader: authHeader(),
      rawBody: raw,
      signatureHeader: sign(raw, secret),
      sourceIp: '1.1.1.1',
      payload
    });

    expect(result.parsedStatus).toBe('quarantined');
    expect((prisma.reviewAlertEmail as { create: jest.Mock }).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'Sender domain not allowed',
          parsedStatus: 'quarantined'
        })
      })
    );
  });

  it('marks missing rating as needs_review', async () => {
    const { service, prisma } = buildService();
    const payload = {
      MessageID: 'msg-missing-rating',
      From: 'Google Business Profile <googlebusinessprofile-noreply@google.com>',
      To: 'sos-reviews@blackbolt.test',
      Subject: 'New review from Alex',
      TextBody: 'Alex left a review. Review link: https://www.google.com/maps?cid=123',
      ReceivedAt: '2026-06-09T10:00:00.000Z'
    };
    const raw = Buffer.from(JSON.stringify(payload));

    const result = await service.receiveGoogleReviewAlert({
      authorizationHeader: authHeader(),
      rawBody: raw,
      signatureHeader: sign(raw, secret),
      sourceIp: '1.1.1.1',
      payload
    });

    expect(result.parsedStatus).toBe('needs_review');
    expect((prisma.reviewAlertEmail as { create: jest.Mock }).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parsedStatus: 'needs_review',
          failureReason: 'Missing explicit rating'
        })
      })
    );
  });

  it('marks missing review link as needs_review', async () => {
    const { service, prisma } = buildService();
    const payload = {
      MessageID: 'msg-missing-link',
      From: 'Google Business Profile <googlebusinessprofile-noreply@google.com>',
      To: 'sos-reviews@blackbolt.test',
      Subject: 'New review from Alex',
      TextBody: 'Alex rated you 5 stars. Great care and fast follow-up.',
      ReceivedAt: '2026-06-09T10:00:00.000Z'
    };
    const raw = Buffer.from(JSON.stringify(payload));

    const result = await service.receiveGoogleReviewAlert({
      authorizationHeader: authHeader(),
      rawBody: raw,
      signatureHeader: sign(raw, secret),
      sourceIp: '1.1.1.1',
      payload
    });

    expect(result.parsedStatus).toBe('needs_review');
    expect((prisma.reviewAlertEmail as { create: jest.Mock }).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'Missing explicit review link'
        })
      })
    );
  });

  it('quarantines PHI-adjacent snippet', async () => {
    const { service, prisma } = buildService();
    const payload = {
      MessageID: 'msg-phi',
      From: 'Google Business Profile <googlebusinessprofile-noreply@google.com>',
      To: 'sos-reviews@blackbolt.test',
      Subject: 'New review from Alex',
      TextBody: 'Alex rated you 5 stars. Review mentioned treatment notes and insurance details. Review link: https://www.google.com/maps?cid=123',
      ReceivedAt: '2026-06-09T10:00:00.000Z'
    };
    const raw = Buffer.from(JSON.stringify(payload));

    const result = await service.receiveGoogleReviewAlert({
      authorizationHeader: authHeader(),
      rawBody: raw,
      signatureHeader: sign(raw, secret),
      sourceIp: '1.1.1.1',
      payload
    });

    expect(result.parsedStatus).toBe('quarantined');
    expect((prisma.reviewAlertEmail as { create: jest.Mock }).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'PHI-adjacent text detected'
        })
      })
    );
    expect((prisma.integrationAlert as { create: jest.Mock }).create).toHaveBeenCalledTimes(1);
    expect((prisma.auditLog as { create: jest.Mock }).create).toHaveBeenCalledTimes(1);
  });

  it('rejects when the inbound adapter is disabled', async () => {
    process.env.REVIEW_ALERT_INBOUND_ENABLED = '0';
    const { service, prisma } = buildService();
    const result = await service.receiveGoogleReviewAlert({
      authorizationHeader: authHeader(),
      rawBody: Buffer.from('{"MessageID":"msg-disabled"}'),
      signatureHeader: undefined,
      sourceIp: '1.1.1.1',
      payload: { MessageID: 'msg-disabled' }
    });

    expect(result).toEqual({ accepted: true, disabled: true });
    expect((prisma.reviewAlertEmail as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it('rejects misconfigured tenant binding', async () => {
    process.env.REVIEW_ALERT_INBOUND_TENANT_ID = 'tenant-wrong';
    const { service } = buildService();
    await expect(
      service.receiveGoogleReviewAlert({
        authorizationHeader: authHeader(),
        rawBody: Buffer.from('{"MessageID":"msg-tenant"}'),
        signatureHeader: undefined,
        sourceIp: '1.1.1.1',
        payload: { MessageID: 'msg-tenant' }
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed on auth failure', async () => {
    const { service, prisma } = buildService();
    await expect(
      service.receiveGoogleReviewAlert({
        authorizationHeader: 'Basic bad',
        rawBody: Buffer.from('{"MessageID":"msg-auth"}'),
        signatureHeader: undefined,
        sourceIp: '1.1.1.1',
        payload: { MessageID: 'msg-auth' }
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect((prisma.reviewAlertEmail as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.integrationAlert as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect((prisma.auditLog as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });
});
