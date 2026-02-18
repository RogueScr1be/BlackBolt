import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SOS_REQUIRED_PAYMENT_METADATA_KEYS, STRIPE_WEBHOOK_EVENT_NAME } from './sos.constants';
import type { SosCanonicalPayload, StripeEventPayload, StripePaymentIntent } from './sos.types';
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
