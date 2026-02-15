import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PostmarkService } from '../src/modules/postmark/postmark.service';
import { DELIVERY_EVENT_TO_STATE, DELIVERY_STATE_RANK } from '../src/modules/postmark/postmark.constants';

function sign(raw: Buffer, secret: string) {
  return createHmac('sha256', secret).update(raw).digest('base64');
}

function authHeader() {
  return `Basic ${Buffer.from('postmark:webhook-secret').toString('base64')}`;
}

describe('Postmark webhooks', () => {
  const secret = 'postmark-test-secret';

  beforeEach(() => {
    process.env.POSTMARK_WEBHOOK_SECRET = secret;
    process.env.POSTMARK_WEBHOOK_BASIC_AUTH = 'postmark:webhook-secret';
  });

  it('keeps delivery-state mapping centralized', () => {
    expect(DELIVERY_EVENT_TO_STATE.delivery).toBe('DELIVERED');
    expect(DELIVERY_EVENT_TO_STATE.bounce).toBe('BOUNCED');
    expect(DELIVERY_STATE_RANK.BOUNCED).toBeGreaterThan(DELIVERY_STATE_RANK.DELIVERED);
    expect(DELIVERY_EVENT_TO_STATE.opened).toBeUndefined();
    expect(DELIVERY_EVENT_TO_STATE.clicked).toBeUndefined();
  });

  it('rejects invalid basic auth (fail closed)', async () => {
    const upsert = jest.fn();
    const prisma = {
      postmarkWebhookEvent: { upsert, count: jest.fn().mockResolvedValue(0) }
    };
    const queue = { enqueueReconcile: jest.fn() };
    const policyService = { pauseTenant: jest.fn() };
    const metrics = { increment: jest.fn() };
    const limiter = { consume: jest.fn().mockReturnValue(true) };
    const service = new PostmarkService(prisma as never, queue as never, policyService as never, metrics as never, limiter as never);

    await expect(
      service.receiveWebhook({
        authorizationHeader: 'Basic bad',
        rawBody: Buffer.from('{"RecordType":"Delivery"}'),
        signatureHeader: 'bad-signature',
        payload: { RecordType: 'Delivery' },
        sourceIp: '1.1.1.1'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(upsert).not.toHaveBeenCalled();
    expect(metrics.increment).toHaveBeenCalledWith('webhook_auth_fail_total');
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  it('rejects non-allowlisted IP and writes nothing', async () => {
    process.env.POSTMARK_WEBHOOK_IP_ALLOWLIST = '2.2.2.2';
    const upsert = jest.fn();
    const prisma = {
      postmarkWebhookEvent: { upsert, count: jest.fn().mockResolvedValue(0) }
    };
    const queue = { enqueueReconcile: jest.fn() };
    const policyService = { pauseTenant: jest.fn() };
    const metrics = { increment: jest.fn() };
    const limiter = { consume: jest.fn().mockReturnValue(true) };
    const service = new PostmarkService(prisma as never, queue as never, policyService as never, metrics as never, limiter as never);

    await expect(
      service.receiveWebhook({
        authorizationHeader: authHeader(),
        rawBody: Buffer.from('{"RecordType":"Delivery"}'),
        signatureHeader: undefined,
        payload: { RecordType: 'Delivery' },
        sourceIp: '1.1.1.1'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(upsert).not.toHaveBeenCalled();
    delete process.env.POSTMARK_WEBHOOK_IP_ALLOWLIST;
  });

  it('rejects rate-limited webhook before DB write', async () => {
    const upsert = jest.fn();
    const prisma = {
      postmarkWebhookEvent: { upsert, count: jest.fn().mockResolvedValue(0) }
    };
    const queue = { enqueueReconcile: jest.fn() };
    const policyService = { pauseTenant: jest.fn() };
    const metrics = { increment: jest.fn() };
    const limiter = { consume: jest.fn().mockReturnValue(false) };
    const service = new PostmarkService(prisma as never, queue as never, policyService as never, metrics as never, limiter as never);

    await expect(
      service.receiveWebhook({
        authorizationHeader: authHeader(),
        rawBody: Buffer.from('{"RecordType":"Delivery"}'),
        signatureHeader: undefined,
        payload: { RecordType: 'Delivery', Metadata: { tenantId: 'tenant-1' } },
        sourceIp: '1.1.1.1'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(upsert).not.toHaveBeenCalled();
    expect(limiter.consume).toHaveBeenCalledTimes(1);
    expect(limiter.consume).toHaveBeenCalledWith('ip:1.1.1.1', expect.any(Number), 60_000);
  });

  it('verifies against raw bytes but accepts on basic auth when signature mismatches', async () => {
    const now = new Date('2026-02-14T12:00:00.000Z');
    const prisma = {
      postmarkWebhookEvent: {
        upsert: jest.fn().mockResolvedValue({ id: 'evt-raw', createdAt: now, updatedAt: now }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      campaignMessage: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };
    const queue = { enqueueReconcile: jest.fn().mockResolvedValue({ jobId: 'job-1' }) };
    const policyService = { pauseTenant: jest.fn() };
    const metrics = { increment: jest.fn() };
    const limiter = { consume: jest.fn().mockReturnValue(true) };
    const service = new PostmarkService(prisma as never, queue as never, policyService as never, metrics as never, limiter as never);

    const payload = { RecordType: 'Delivery', MessageID: 'msg-raw', ID: 'pm-raw' };
    const rawPretty = Buffer.from('{\n  "RecordType": "Delivery",\n  "MessageID": "msg-raw",\n  "ID": "pm-raw"\n}');
    const rawCompact = Buffer.from(JSON.stringify(payload));

    const accepted = await service.receiveWebhook({
      authorizationHeader: authHeader(),
      rawBody: rawPretty,
      signatureHeader: sign(rawPretty, secret),
      payload,
      sourceIp: '1.1.1.1'
    });
    expect(accepted.accepted).toBe(true);

    const acceptedMismatchedSig = await service.receiveWebhook({
      authorizationHeader: authHeader(),
      rawBody: rawPretty,
      signatureHeader: sign(rawCompact, secret),
      payload: { ...payload, ID: 'pm-raw-2' },
      sourceIp: '1.1.1.1'
    });
    expect(acceptedMismatchedSig.accepted).toBe(true);
  });

  it('dedupes duplicate webhook deliveries', async () => {
    const now = new Date('2026-02-14T12:00:00.000Z');
    const prisma = {
      postmarkWebhookEvent: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ id: 'evt-1', createdAt: now, updatedAt: now })
          .mockResolvedValueOnce({ id: 'evt-1', createdAt: now, updatedAt: new Date(now.getTime() + 1000) }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      campaignMessage: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({})
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };
    const queue = { enqueueReconcile: jest.fn().mockResolvedValue({ jobId: 'job-1' }) };
    const policyService = { pauseTenant: jest.fn() };
    const metrics = { increment: jest.fn() };
    const limiter = { consume: jest.fn().mockReturnValue(true) };
    const service = new PostmarkService(prisma as never, queue as never, policyService as never, metrics as never, limiter as never);

    const body = { RecordType: 'Delivery', MessageID: 'msg-1', ID: 'pm-1', ReceivedAt: '2026-02-14T12:00:00.000Z' };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = sign(raw, secret);

    const first = await service.receiveWebhook({ authorizationHeader: authHeader(), rawBody: raw, signatureHeader: sig, payload: body, sourceIp: '1.1.1.1' });
    const second = await service.receiveWebhook({ authorizationHeader: authHeader(), rawBody: raw, signatureHeader: sig, payload: body, sourceIp: '1.1.1.1' });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(prisma.postmarkWebhookEvent.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.sendEvent.upsert).toHaveBeenCalledTimes(0);
  });

  it('accepts previous basic credential during rotation and records metric', async () => {
    process.env.POSTMARK_WEBHOOK_BASIC_AUTH = 'postmark:new-secret';
    process.env.POSTMARK_WEBHOOK_BASIC_AUTH_PREVIOUS = 'postmark:webhook-secret';

    const now = new Date('2026-02-14T12:00:00.000Z');
    const prisma = {
      postmarkWebhookEvent: {
        upsert: jest.fn().mockResolvedValue({ id: 'evt-rot', createdAt: now, updatedAt: now }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      campaignMessage: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({})
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };
    const queue = { enqueueReconcile: jest.fn().mockResolvedValue({ jobId: 'job-1' }) };
    const policyService = { pauseTenant: jest.fn() };
    const metrics = { increment: jest.fn() };
    const limiter = { consume: jest.fn().mockReturnValue(true) };
    const service = new PostmarkService(prisma as never, queue as never, policyService as never, metrics as never, limiter as never);

    const body = { RecordType: 'Delivery', MessageID: 'msg-rotate', ID: 'pm-rotate' };
    const raw = Buffer.from(JSON.stringify(body));
    await service.receiveWebhook({
      authorizationHeader: authHeader(),
      rawBody: raw,
      signatureHeader: sign(raw, secret),
      payload: body,
      sourceIp: '1.1.1.1'
    });

    expect(metrics.increment).toHaveBeenCalledWith('webhook_auth_previous_cred_total');
  });

  it('keeps terminal state on out-of-order events', async () => {
    const now = new Date('2026-02-14T12:00:00.000Z');
    let currentDeliveryState = 'BOUNCED';
    const prisma = {
      postmarkWebhookEvent: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ id: 'evt-1', createdAt: now, updatedAt: now })
          .mockResolvedValueOnce({ id: 'evt-2', createdAt: now, updatedAt: now }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      campaignMessage: {
        findFirst: jest.fn().mockImplementation(() =>
          Promise.resolve({ id: 'cm-1', tenantId: 'tenant-1', status: 'SENT', deliveryState: currentDeliveryState })
        ),
        update: jest.fn().mockImplementation(({ data }) => {
          if (data.deliveryState) {
            currentDeliveryState = data.deliveryState;
          }
          return Promise.resolve({});
        })
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };
    const queue = { enqueueReconcile: jest.fn().mockResolvedValue({ jobId: 'job-1' }) };
    const policyService = { pauseTenant: jest.fn() };
    const metrics = { increment: jest.fn() };
    const limiter = { consume: jest.fn().mockReturnValue(true) };
    const service = new PostmarkService(prisma as never, queue as never, policyService as never, metrics as never, limiter as never);

    const bounce = { RecordType: 'Bounce', MessageID: 'msg-1', ID: 'pm-2', Metadata: { tenantId: 'tenant-1' } };
    const delivered = { RecordType: 'Delivery', MessageID: 'msg-1', ID: 'pm-3', Metadata: { tenantId: 'tenant-1' } };

    await service.receiveWebhook({
      authorizationHeader: authHeader(),
      rawBody: Buffer.from(JSON.stringify(bounce)),
      signatureHeader: sign(Buffer.from(JSON.stringify(bounce)), secret),
      payload: bounce,
      sourceIp: '1.1.1.1'
    });

    await service.receiveWebhook({
      authorizationHeader: authHeader(),
      rawBody: Buffer.from(JSON.stringify(delivered)),
      signatureHeader: sign(Buffer.from(JSON.stringify(delivered)), secret),
      payload: delivered,
      sourceIp: '1.1.1.1'
    });

    expect(currentDeliveryState).toBe('BOUNCED');
  });

  it('reconcile resolves unknown message and marks event resolved', async () => {
    const event = {
      id: 'evt-1',
      tenantId: null,
      providerMessageId: 'msg-1',
      eventType: 'delivery',
      payloadRedactedJson: { RecordType: 'Delivery', MessageID: 'msg-1', ID: 'pm-1' },
      reconcileStatus: 'PENDING',
      reconcileAttempts: 0
    };
    const prisma = {
      postmarkWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
      },
      campaignMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cm-1', tenantId: 'tenant-1', status: 'SENT', deliveryState: 'SENT' }),
        update: jest.fn().mockResolvedValue({})
      },
      sendEvent: { upsert: jest.fn().mockResolvedValue({}) },
      integrationAlert: { create: jest.fn().mockResolvedValue({}) }
    };

    const queue = { enqueueReconcile: jest.fn().mockResolvedValue({}) };
    const policyService = { pauseTenant: jest.fn() };
    const metrics = { increment: jest.fn() };
    const limiter = { consume: jest.fn().mockReturnValue(true) };
    const service = new PostmarkService(prisma as never, queue as never, policyService as never, metrics as never, limiter as never);

    const result = await service.reconcileEventById('evt-1', async () => 'tenant-1');

    expect(result.done).toBe(true);
    expect(prisma.sendEvent.upsert).toHaveBeenCalled();
    expect(prisma.campaignMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryState: 'DELIVERED'
        })
      })
    );
    expect(prisma.postmarkWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reconcileStatus: 'RESOLVED'
        })
      })
    );
  });
});
