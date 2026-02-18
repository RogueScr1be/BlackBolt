import { createHash } from 'node:crypto';
import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SOS_REQUIRED_PAYMENT_METADATA_KEYS, STRIPE_WEBHOOK_EVENT_NAME } from './sos.constants';
import type {
  SosCanonicalPayload,
  SosCreatePaymentIntentRequest,
  SosCreatePaymentIntentResponse,
  StripeEventPayload,
  StripePaymentIntent
} from './sos.types';
import { SosQueue } from './sos.queue';
import { verifyStripeSignature } from './stripe.signature';

function requiredMetadata(metadata: Record<string, string | undefined>, key: string): string {
  const value = metadata[key]?.trim();
  if (!value) {
    throw new BadRequestException(`Missing required payment metadata: ${key}`);
  }
  return value;
}

@Injectable()
export class SosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sosQueue: SosQueue
  ) {}

  async receiveStripeWebhook(input: {
    signatureHeader: string | undefined;
    rawBody: Buffer | undefined;
    payload: StripeEventPayload;
  }) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !input.signatureHeader || !input.rawBody) {
      throw new UnauthorizedException('Missing stripe webhook signature verification requirements');
    }

    const signatureOk = verifyStripeSignature({
      rawBody: input.rawBody,
      signatureHeader: input.signatureHeader,
      secret
    });

    if (!signatureOk) {
      throw new UnauthorizedException('Invalid stripe webhook signature');
    }

    if (!input.payload?.id || !input.payload?.type) {
      throw new BadRequestException('Invalid stripe webhook payload');
    }

    if (input.payload.type !== STRIPE_WEBHOOK_EVENT_NAME) {
      return { accepted: false, reason: 'event_type_ignored' as const };
    }

    const paymentIntent = this.parsePaymentIntent(input.payload);
    const metadata = paymentIntent.metadata ?? {};

    for (const key of SOS_REQUIRED_PAYMENT_METADATA_KEYS) {
      requiredMetadata(metadata, key);
    }

    const tenantId = requiredMetadata(metadata, 'sos_tenant_id');
    const consultType = requiredMetadata(metadata, 'sos_consult_type');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw new BadRequestException('Unknown sos_tenant_id');
    }

    const canonical: SosCanonicalPayload = {
      case: {
        consultType,
        payment: {
          stripePaymentIntentId: paymentIntent.id,
          depositStatus: 'paid'
        }
      },
      patient: {
        parentName: requiredMetadata(metadata, 'sos_parent_name'),
        email: requiredMetadata(metadata, 'sos_parent_email'),
        phone: requiredMetadata(metadata, 'sos_parent_phone'),
        address: requiredMetadata(metadata, 'sos_parent_address')
      },
      baby: {
        name: requiredMetadata(metadata, 'sos_baby_name'),
        dob: requiredMetadata(metadata, 'sos_baby_dob')
      }
    };

    const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');

    let created = false;
    const webhookEvent = await this.prisma.sosStripeWebhookEvent
      .upsert({
        where: {
          providerEventId: input.payload.id
        },
        update: {},
        create: {
          tenantId,
          providerEventId: input.payload.id,
          paymentIntentId: paymentIntent.id,
          eventType: input.payload.type,
          payloadHash,
          payloadRedactedJson: {
            canonical,
            metadata: {
              source: 'stripe_webhook',
              paymentIntentId: paymentIntent.id
            }
          } as Prisma.InputJsonValue,
          receivedAt: new Date()
        }
      })
      .then((row) => {
        created = row.createdAt.getTime() === row.updatedAt.getTime();
        return row;
      });

    if (!created) {
      return {
        accepted: true,
        queued: false,
        duplicate: true,
        eventId: webhookEvent.id
      };
    }

    const idempotencyKey = `sos-case:create:${tenantId}:${paymentIntent.id}`;
    const queued = await this.sosQueue.enqueueCaseCreate({
      tenantId,
      paymentIntentId: paymentIntent.id,
      webhookEventId: webhookEvent.id,
      idempotencyKey
    });

    return {
      accepted: true,
      queued: true,
      duplicate: false,
      eventId: webhookEvent.id,
      jobId: queued.jobId,
      idempotencyKey: queued.idempotencyKey
    };
  }

  async createPaymentIntent(input: SosCreatePaymentIntentRequest): Promise<SosCreatePaymentIntentResponse> {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      throw new ServiceUnavailableException('STRIPE_SECRET_KEY is required');
    }

    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw new BadRequestException('Unknown sos_tenant_id');
    }

    const metadata: Record<string, string> = {
      sos_tenant_id: input.tenantId.trim(),
      sos_consult_type: input.consultType.trim(),
      sos_parent_name: input.parentName.trim(),
      sos_parent_email: input.parentEmail.trim(),
      sos_parent_phone: input.parentPhone.trim(),
      sos_parent_address: input.parentAddress.trim(),
      sos_baby_name: input.babyName.trim(),
      sos_baby_dob: input.babyDob.trim()
    };

    for (const key of SOS_REQUIRED_PAYMENT_METADATA_KEYS) {
      if (!metadata[key]) {
        throw new BadRequestException(`Missing required payment metadata: ${key}`);
      }
    }

    const currency = (input.currency ?? 'usd').toLowerCase();
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      createHash('sha256')
        .update(
          JSON.stringify({
            tenantId: input.tenantId,
            consultType: input.consultType,
            amountCents: input.amountCents,
            currency,
            parentEmail: input.parentEmail
          })
        )
        .digest('hex')
        .slice(0, 32);

    const body = new URLSearchParams();
    body.set('amount', String(input.amountCents));
    body.set('currency', currency);
    body.set('automatic_payment_methods[enabled]', 'true');
    for (const [key, value] of Object.entries(metadata)) {
      body.set(`metadata[${key}]`, value);
    }

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `sos-intake:${idempotencyKey}`
      },
      body
    });

    const text = await response.text();
    let payload: StripePaymentIntent | { error?: { message?: string } } = {};
    try {
      payload = JSON.parse(text) as StripePaymentIntent | { error?: { message?: string } };
    } catch {
      payload = {};
    }

    if (!response.ok || !('id' in payload) || typeof payload.id !== 'string') {
      const errorMessage =
        ('error' in payload && payload.error?.message) || `Stripe payment intent request failed (${response.status})`;
      throw new BadGatewayException(errorMessage);
    }

    return {
      accepted: true,
      paymentIntentId: payload.id,
      clientSecret: payload.client_secret ?? null,
      status: payload.status ?? null,
      amount: typeof payload.amount === 'number' ? payload.amount : input.amountCents,
      currency: payload.currency ?? currency,
      idempotencyKey: `sos-intake:${idempotencyKey}`
    };
  }

  private parsePaymentIntent(event: StripeEventPayload): StripePaymentIntent {
    const candidate = event.data?.object as StripePaymentIntent | undefined;
    if (!candidate || typeof candidate.id !== 'string') {
      throw new BadRequestException('Stripe event does not include a valid payment intent object');
    }

    if (candidate.metadata && typeof candidate.metadata !== 'object') {
      throw new BadRequestException('Stripe payment intent metadata is invalid');
    }

    return {
      id: candidate.id,
      metadata: candidate.metadata ?? {}
    };
  }
}
