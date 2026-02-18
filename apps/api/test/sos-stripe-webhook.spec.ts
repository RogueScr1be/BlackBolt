import { createHmac } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SosService } from '../src/modules/sos/sos.service';

function signStripe(rawBody: Buffer, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const digest = createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

describe('SosService stripe webhook', () => {
  const secret = 'stripe_test_secret';

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;
  });

  it('rejects invalid stripe signature', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn()
      },
      sosStripeWebhookEvent: {
        upsert: jest.fn()
      }
    };
    const queue = { enqueueCaseCreate: jest.fn() };
    const service = new SosService(prisma as never, queue as never);

    await expect(
      service.receiveStripeWebhook({
        signatureHeader: 't=1,v1=bad',
        rawBody: Buffer.from('{"id":"evt_1"}'),
        payload: { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', metadata: {} } } }
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.sosStripeWebhookEvent.upsert).not.toHaveBeenCalled();
  });

  it('ignores non-payment_intent.succeeded events', async () => {
    const raw = Buffer.from(JSON.stringify({ id: 'evt_2', type: 'charge.refunded' }));
    const signatureHeader = signStripe(raw, secret);

    const prisma = {
      tenant: {
        findUnique: jest.fn()
      },
      sosStripeWebhookEvent: {
        upsert: jest.fn()
      }
    };
    const queue = { enqueueCaseCreate: jest.fn() };
    const service = new SosService(prisma as never, queue as never);

    const result = await service.receiveStripeWebhook({
      signatureHeader,
      rawBody: raw,
      payload: { id: 'evt_2', type: 'charge.refunded', data: { object: {} } }
    });

    expect(result).toEqual({ accepted: false, reason: 'event_type_ignored' });
    expect(prisma.sosStripeWebhookEvent.upsert).not.toHaveBeenCalled();
    expect(queue.enqueueCaseCreate).not.toHaveBeenCalled();
  });

  it('upserts webhook event and enqueues deterministic SOS job', async () => {
    const payload = {
      id: 'evt_3',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_3',
          metadata: {
            sos_tenant_id: 'tenant-sos',
            sos_consult_type: 'in_home',
            sos_parent_name: 'Leah Whitley',
            sos_parent_email: 'leah@example.com',
            sos_parent_phone: '832-111-2222',
            sos_parent_address: 'Houston, TX',
            sos_baby_name: 'Baby W',
            sos_baby_dob: '2026-01-01'
          }
        }
      }
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const signatureHeader = signStripe(raw, secret);

    const upsert = jest.fn().mockResolvedValue({
      id: 'swe_1',
      createdAt: new Date('2026-02-18T12:00:00.000Z'),
      updatedAt: new Date('2026-02-18T12:00:00.000Z')
    });

    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-sos' })
      },
      sosStripeWebhookEvent: {
        upsert
      }
    };
    const queue = {
      enqueueCaseCreate: jest.fn().mockResolvedValue({
        jobId: 'job-1',
        idempotencyKey: 'sos-case:create:tenant-sos:pi_3'
      })
    };

    const service = new SosService(prisma as never, queue as never);
    const result = await service.receiveStripeWebhook({ signatureHeader, rawBody: raw, payload });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(queue.enqueueCaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-sos',
        paymentIntentId: 'pi_3',
        webhookEventId: 'swe_1',
        idempotencyKey: 'sos-case:create:tenant-sos:pi_3'
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        accepted: true,
        queued: true,
        duplicate: false,
        eventId: 'swe_1',
        idempotencyKey: 'sos-case:create:tenant-sos:pi_3'
      })
    );
  });

  it('dedupes duplicate stripe events and does not enqueue', async () => {
    const payload = {
      id: 'evt_dup',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_dup',
          metadata: {
            sos_tenant_id: 'tenant-sos',
            sos_consult_type: 'phone',
            sos_parent_name: 'Leah Whitley',
            sos_parent_email: 'leah@example.com',
            sos_parent_phone: '832-111-2222',
            sos_parent_address: 'Houston, TX',
            sos_baby_name: 'Baby W',
            sos_baby_dob: '2026-01-01'
          }
        }
      }
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const signatureHeader = signStripe(raw, secret);

    const upsert = jest.fn().mockResolvedValue({
      id: 'swe_dup',
      createdAt: new Date('2026-02-18T12:00:00.000Z'),
      updatedAt: new Date('2026-02-18T12:01:00.000Z')
    });

    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-sos' })
      },
      sosStripeWebhookEvent: {
        upsert
      }
    };
    const queue = {
      enqueueCaseCreate: jest.fn()
    };

    const service = new SosService(prisma as never, queue as never);
    const result = await service.receiveStripeWebhook({ signatureHeader, rawBody: raw, payload });

    expect(result).toEqual(
      expect.objectContaining({
        accepted: true,
        queued: false,
        duplicate: true,
        eventId: 'swe_dup'
      })
    );
    expect(queue.enqueueCaseCreate).not.toHaveBeenCalled();
  });

  it('hard-fails unknown sos_tenant_id without event persistence or enqueue', async () => {
    const payload = {
      id: 'evt_missing_tenant',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_missing_tenant',
          metadata: {
            sos_tenant_id: 'tenant-missing',
            sos_consult_type: 'in_home',
            sos_parent_name: 'Leah Whitley',
            sos_parent_email: 'leah@example.com',
            sos_parent_phone: '832-111-2222',
            sos_parent_address: 'Houston, TX',
            sos_baby_name: 'Baby W',
            sos_baby_dob: '2026-01-01'
          }
        }
      }
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const signatureHeader = signStripe(raw, secret);

    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null)
      },
      sosStripeWebhookEvent: {
        upsert: jest.fn()
      }
    };
    const queue = {
      enqueueCaseCreate: jest.fn()
    };

    const service = new SosService(prisma as never, queue as never);

    await expect(
      service.receiveStripeWebhook({
        signatureHeader,
        rawBody: raw,
        payload
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.sosStripeWebhookEvent.upsert).not.toHaveBeenCalled();
    expect(queue.enqueueCaseCreate).not.toHaveBeenCalled();
  });
});
