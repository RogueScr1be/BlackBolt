import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { SosService } from '../src/modules/sos/sos.service';

describe('SosService createPaymentIntent', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('rejects unknown tenant', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null)
      }
    };
    const service = new SosService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.createPaymentIntent({
        tenantId: 'tenant-missing',
        consultType: 'remote_video',
        parentName: 'Parent One',
        parentEmail: 'parent@example.com',
        parentPhone: '555-111-2222',
        parentAddress: 'Houston, TX',
        babyName: 'Baby One',
        babyDob: '2026-01-01',
        amountCents: 5000
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails when STRIPE_SECRET_KEY is missing', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn()
      }
    };
    const service = new SosService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.createPaymentIntent({
        tenantId: 'tenant-sos',
        consultType: 'remote_video',
        parentName: 'Parent One',
        parentEmail: 'parent@example.com',
        parentPhone: '555-111-2222',
        parentAddress: 'Houston, TX',
        babyName: 'Baby One',
        babyDob: '2026-01-01',
        amountCents: 5000
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('creates stripe payment intent with required metadata', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'pi_123',
          client_secret: 'pi_123_secret',
          status: 'requires_payment_method',
          amount: 5000,
          currency: 'usd'
        })
    } as Response);

    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-sos' })
      }
    };
    const service = new SosService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.createPaymentIntent({
      tenantId: 'tenant-sos',
      consultType: 'remote_video',
      parentName: 'Parent One',
      parentEmail: 'parent@example.com',
      parentPhone: '555-111-2222',
      parentAddress: 'Houston, TX',
      babyName: 'Baby One',
      babyDob: '2026-01-01',
      amountCents: 5000
    });

    expect(result).toEqual(
      expect.objectContaining({
        accepted: true,
        paymentIntentId: 'pi_123',
        clientSecret: 'pi_123_secret',
        amount: 5000,
        currency: 'usd'
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/payment_intents',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_123'
        })
      })
    );

    const call = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const body = call.body as URLSearchParams;
    expect(body.get('metadata[sos_tenant_id]')).toBe('tenant-sos');
    expect(body.get('metadata[sos_parent_email]')).toBe('parent@example.com');
    expect(body.get('metadata[sos_baby_name]')).toBe('Baby One');
  });

  it('surfaces stripe api failures', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => JSON.stringify({ error: { message: 'Card declined' } })
    } as Response);

    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-sos' })
      }
    };
    const service = new SosService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.createPaymentIntent({
        tenantId: 'tenant-sos',
        consultType: 'phone',
        parentName: 'Parent One',
        parentEmail: 'parent@example.com',
        parentPhone: '555-111-2222',
        parentAddress: 'Houston, TX',
        babyName: 'Baby One',
        babyDob: '2026-01-01',
        amountCents: 5000
      })
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
