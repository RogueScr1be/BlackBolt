import { createHash } from 'node:crypto';
import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SOS_REQUIRED_PAYMENT_METADATA_KEYS, STRIPE_WEBHOOK_EVENT_NAME } from './sos.constants';
import type {
  SosCaseDetail,
  SosCaseListItem,
  SosCanonicalPayload,
  SosCreatePaymentIntentRequest,
  SosCreatePaymentIntentResponse,
  SosFollowupSweepResponse,
  SosGeneratePediIntakeResponse,
  SosSaveSoapResponse,
  SosSendActionResponse,
  SosSoapInput,
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

function extractCanonicalIdentity(canonicalJson: Prisma.JsonValue | null | undefined): {
  parentName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  babyName: string | null;
  babyDob: string | null;
} {
  if (!canonicalJson || typeof canonicalJson !== 'object' || Array.isArray(canonicalJson)) {
    return {
      parentName: null,
      email: null,
      phone: null,
      address: null,
      babyName: null,
      babyDob: null
    };
  }

  const value = canonicalJson as {
    patient?: { parentName?: string; email?: string; phone?: string; address?: string };
    baby?: { name?: string; dob?: string };
  };

  return {
    parentName: value.patient?.parentName ?? null,
    email: value.patient?.email ?? null,
    phone: value.patient?.phone ?? null,
    address: value.patient?.address ?? null,
    babyName: value.baby?.name ?? null,
    babyDob: value.baby?.dob ?? null
  };
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

  async listCases(input: { tenantId: string; status?: string; limit?: number }): Promise<{ items: SosCaseListItem[] }> {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw new BadRequestException('Unknown sos_tenant_id');
    }

    const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
    const cases = await this.prisma.sosCase.findMany({
      where: {
        tenantId,
        ...(input.status?.trim() ? { status: input.status.trim() } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const payloads = await Promise.all(
      cases.map((sosCase) =>
        this.prisma.sosCasePayload.findFirst({
          where: { caseId: sosCase.id },
          orderBy: { version: 'desc' }
        })
      )
    );

    const items = cases.map((sosCase, index) => {
      const identity = extractCanonicalIdentity(payloads[index]?.canonicalJson);
      return {
        caseId: sosCase.id,
        tenantId: sosCase.tenantId,
        consultType: sosCase.consultType,
        status: sosCase.status,
        createdAt: sosCase.createdAt.toISOString(),
        parentName: identity.parentName,
        babyName: identity.babyName,
        driveFolderUrl: sosCase.driveFolderUrl ?? null
      };
    });

    return { items };
  }

  async getCaseDetail(input: { tenantId: string; caseId: string }): Promise<SosCaseDetail> {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    if (!input.caseId?.trim()) {
      throw new BadRequestException('caseId is required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw new BadRequestException('Unknown sos_tenant_id');
    }

    const sosCase = await this.prisma.sosCase.findFirst({
      where: {
        id: input.caseId,
        tenantId
      }
    });
    if (!sosCase) {
      throw new BadRequestException('SOS case not found');
    }

    const latestPayload = await this.prisma.sosCasePayload.findFirst({
      where: { caseId: sosCase.id },
      orderBy: { version: 'desc' }
    });
    const identity = extractCanonicalIdentity(latestPayload?.canonicalJson);

    return {
      caseId: sosCase.id,
      tenantId: sosCase.tenantId,
      consultType: sosCase.consultType,
      status: sosCase.status,
      createdAt: sosCase.createdAt.toISOString(),
      driveFolderId: sosCase.driveFolderId ?? null,
      driveFolderUrl: sosCase.driveFolderUrl ?? null,
      patient: {
        parentName: identity.parentName,
        email: identity.email,
        phone: identity.phone,
        address: identity.address
      },
      baby: {
        name: identity.babyName,
        dob: identity.babyDob
      },
      actions: {
        openFolder: Boolean(sosCase.driveFolderUrl),
        soapNotes: true,
        generatePediIntake: true,
        sendFollowUp: true,
        sendProviderFax: true
      }
    };
  }

  async saveSoap(input: { tenantId: string; caseId: string; soap: SosSoapInput }): Promise<SosSaveSoapResponse> {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    if (!input.caseId?.trim()) {
      throw new BadRequestException('caseId is required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw new BadRequestException('Unknown sos_tenant_id');
    }

    const sosCase = await this.prisma.sosCase.findFirst({
      where: {
        id: input.caseId,
        tenantId
      }
    });
    if (!sosCase) {
      throw new BadRequestException('SOS case not found');
    }

    if (!input.soap.subjective?.trim() || !input.soap.objective?.trim() || !input.soap.assessment?.trim() || !input.soap.plan?.trim()) {
      throw new BadRequestException('All SOAP sections are required');
    }

    const latestPayload = await this.prisma.sosCasePayload.findFirst({
      where: { caseId: sosCase.id },
      orderBy: { version: 'desc' }
    });
    const latestCanonical =
      latestPayload?.canonicalJson && typeof latestPayload.canonicalJson === 'object' && !Array.isArray(latestPayload.canonicalJson)
        ? (latestPayload.canonicalJson as Record<string, unknown>)
        : {};

    const canonicalNext = {
      ...latestCanonical,
      soap: {
        subjective: input.soap.subjective.trim(),
        objective: input.soap.objective.trim(),
        assessment: input.soap.assessment.trim(),
        plan: input.soap.plan.trim()
      }
    };

    const newPayload = await this.prisma.sosCasePayload.create({
      data: {
        caseId: sosCase.id,
        version: (latestPayload?.version ?? 0) + 1,
        canonicalJson: canonicalNext as Prisma.InputJsonValue
      }
    });

    await this.prisma.sosArtifact.upsert({
      where: {
        caseId_artifactType: {
          caseId: sosCase.id,
          artifactType: 'soap_note_pdf'
        }
      },
      update: {
        fileName: `soap_note_${sosCase.id}.pdf`,
        metadataJson: {
          generatedBy: 'phase5',
          renderStatus: 'pending_pdf_renderer',
          payloadVersion: newPayload.version
        } as Prisma.InputJsonValue
      },
      create: {
        tenantId,
        caseId: sosCase.id,
        artifactType: 'soap_note_pdf',
        fileName: `soap_note_${sosCase.id}.pdf`,
        metadataJson: {
          generatedBy: 'phase5',
          renderStatus: 'pending_pdf_renderer',
          payloadVersion: newPayload.version
        } as Prisma.InputJsonValue
      }
    });

    await this.prisma.sosCase.update({
      where: { id: sosCase.id },
      data: { status: 'CONSULTED' }
    });

    return {
      caseId: sosCase.id,
      payloadVersion: newPayload.version,
      soapSaved: true
    };
  }

  async generatePediIntake(input: { tenantId: string; caseId: string }): Promise<SosGeneratePediIntakeResponse> {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    if (!input.caseId?.trim()) {
      throw new BadRequestException('caseId is required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw new BadRequestException('Unknown sos_tenant_id');
    }

    const sosCase = await this.prisma.sosCase.findFirst({
      where: {
        id: input.caseId,
        tenantId
      }
    });
    if (!sosCase) {
      throw new BadRequestException('SOS case not found');
    }

    const latestPayload = await this.prisma.sosCasePayload.findFirst({
      where: { caseId: sosCase.id },
      orderBy: { version: 'desc' }
    });
    if (!latestPayload) {
      throw new BadRequestException('SOS case payload missing');
    }

    await this.prisma.sosArtifact.upsert({
      where: {
        caseId_artifactType: {
          caseId: sosCase.id,
          artifactType: 'pedi_intake_pdf'
        }
      },
      update: {
        fileName: `pedi_intake_${sosCase.id}.pdf`,
        metadataJson: {
          generatedBy: 'phase5',
          generationMode: 'canonical_mapping',
          renderStatus: 'pending_pdf_renderer',
          payloadVersion: latestPayload.version
        } as Prisma.InputJsonValue
      },
      create: {
        tenantId,
        caseId: sosCase.id,
        artifactType: 'pedi_intake_pdf',
        fileName: `pedi_intake_${sosCase.id}.pdf`,
        metadataJson: {
          generatedBy: 'phase5',
          generationMode: 'canonical_mapping',
          renderStatus: 'pending_pdf_renderer',
          payloadVersion: latestPayload.version
        } as Prisma.InputJsonValue
      }
    });

    return {
      caseId: sosCase.id,
      artifactType: 'pedi_intake_pdf',
      generatedAt: new Date().toISOString()
    };
  }

  async sendFollowUp(input: { tenantId: string; caseId: string }): Promise<SosSendActionResponse> {
    return this.sendCaseArtifactAction({
      tenantId: input.tenantId,
      caseId: input.caseId,
      artifactType: 'follow_up_letter_pdf',
      fileNamePrefix: 'follow_up_letter',
      auditAction: 'sos.follow_up.send'
    });
  }

  async sendProviderFax(input: { tenantId: string; caseId: string }): Promise<SosSendActionResponse> {
    return this.sendCaseArtifactAction({
      tenantId: input.tenantId,
      caseId: input.caseId,
      artifactType: 'provider_fax_packet_pdf',
      fileNamePrefix: 'provider_fax_packet',
      auditAction: 'sos.provider_fax.send'
    });
  }

  async runFollowupSweep(input: {
    tenantId: string;
    windowStartDays?: number;
    windowEndDays?: number;
  }): Promise<SosFollowupSweepResponse> {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw new BadRequestException('Unknown sos_tenant_id');
    }

    const windowStartDays = Math.max(1, Math.min(input.windowStartDays ?? 30, 365));
    const windowEndDays = Math.max(windowStartDays + 1, Math.min(input.windowEndDays ?? 60, 366));
    const now = new Date();
    const start = new Date(now.getTime() - windowEndDays * 24 * 60 * 60 * 1000);
    const end = new Date(now.getTime() - windowStartDays * 24 * 60 * 60 * 1000);

    const dueCases = await this.prisma.sosCase.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: start,
          lte: end
        }
      },
      select: {
        id: true
      }
    });

    let queuedCount = 0;
    let skippedCount = 0;

    for (const sosCase of dueCases) {
      const existing = await this.prisma.sosArtifact.findUnique({
        where: {
          caseId_artifactType: {
            caseId: sosCase.id,
            artifactType: 'review_referral_email'
          }
        }
      });

      if (existing) {
        skippedCount += 1;
        continue;
      }

      await this.prisma.sosArtifact.create({
        data: {
          tenantId,
          caseId: sosCase.id,
          artifactType: 'review_referral_email',
          fileName: `review_referral_${sosCase.id}.eml`,
          metadataJson: {
            generatedBy: 'phase7',
            sendStatus: 'pending_dispatch'
          } as Prisma.InputJsonValue
        }
      });

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'sos.followup.sweep.queue',
          entityType: 'sos_case',
          entityId: sosCase.id,
          metadataJson: {
            artifactType: 'review_referral_email',
            windowStartDays,
            windowEndDays
          } as Prisma.InputJsonValue
        }
      });
      queuedCount += 1;
    }

    return {
      tenantId,
      windowStartDays,
      windowEndDays,
      dueCount: dueCases.length,
      queuedCount,
      skippedCount,
      runAt: now.toISOString()
    };
  }

  private async sendCaseArtifactAction(input: {
    tenantId: string;
    caseId: string;
    artifactType: 'follow_up_letter_pdf' | 'provider_fax_packet_pdf';
    fileNamePrefix: string;
    auditAction: string;
  }): Promise<SosSendActionResponse> {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    if (!input.caseId?.trim()) {
      throw new BadRequestException('caseId is required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw new BadRequestException('Unknown sos_tenant_id');
    }

    const sosCase = await this.prisma.sosCase.findFirst({
      where: {
        id: input.caseId,
        tenantId
      }
    });
    if (!sosCase) {
      throw new BadRequestException('SOS case not found');
    }

    await this.prisma.sosArtifact.upsert({
      where: {
        caseId_artifactType: {
          caseId: sosCase.id,
          artifactType: input.artifactType
        }
      },
      update: {
        fileName: `${input.fileNamePrefix}_${sosCase.id}.pdf`,
        metadataJson: {
          sendStatus: 'simulated_sent',
          sentAt: new Date().toISOString(),
          integration: 'phase6_placeholder'
        } as Prisma.InputJsonValue
      },
      create: {
        tenantId,
        caseId: sosCase.id,
        artifactType: input.artifactType,
        fileName: `${input.fileNamePrefix}_${sosCase.id}.pdf`,
        metadataJson: {
          sendStatus: 'simulated_sent',
          sentAt: new Date().toISOString(),
          integration: 'phase6_placeholder'
        } as Prisma.InputJsonValue
      }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: input.auditAction,
        entityType: 'sos_case',
        entityId: sosCase.id,
        metadataJson: {
          artifactType: input.artifactType,
          simulated: true
        } as Prisma.InputJsonValue
      }
    });

    return {
      caseId: sosCase.id,
      artifactType: input.artifactType,
      sentAt: new Date().toISOString(),
      simulated: true
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
