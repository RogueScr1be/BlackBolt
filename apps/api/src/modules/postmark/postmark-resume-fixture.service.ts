import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PostmarkPolicyService } from './postmark-policy.service';

export const POSTMARK_RESUME_FIXTURE_MARKER_PREFIX = 'fixture:postmark-resume:';
export const POSTMARK_RESUME_FIXTURE_TEMPLATE_VERSION = 'postmark-resume-fixture-v1';
export const POSTMARK_RESUME_FIXTURE_LAST_ERROR_CLASS = 'fixture_prepared';
const POSTMARK_RESUME_FIXTURE_WINDOW_MINUTES = 60;

type PrepareFixtureResult = {
  fixtureToken: string;
  pausedUntil: string;
  customerId: string;
  campaignId: string;
  draftMessageId: string;
  campaignMessageId: string;
  expectedRequeuedMessageCount: 1;
};

type CleanupFixtureResult = {
  fixtureToken: string;
  pauseCleared: boolean;
  deletedCampaignMessageCount: number;
  deletedDraftMessageCount: number;
  deletedCampaignCount: number;
  deletedCustomerCount: number;
};

@Injectable()
export class PostmarkResumeFixtureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PostmarkPolicyService
  ) {}

  async prepareFixture(tenantId: string, actorUserId: string | null): Promise<PrepareFixtureResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const policy = await this.policyService.getTenantPolicy(tenantId);
    if (!policy.shadowMode || policy.shadowRate !== 100) {
      throw new BadRequestException('Fixture prep requires a shadow-safe tenant');
    }

    const now = new Date();
    if (policy.pausedUntil && policy.pausedUntil.getTime() > now.getTime()) {
      throw new ConflictException('Tenant send path is already paused');
    }

    const [pausedProviderNullCount, existingFixtureState] = await Promise.all([
      this.prisma.campaignMessage.count({
        where: {
          tenantId,
          status: 'PAUSED',
          providerMessageId: null
        }
      }),
      this.getExistingFixtureState(tenantId)
    ]);

    if (pausedProviderNullCount > 0) {
      throw new ConflictException('Tenant already has paused provider-unclaimed messages');
    }
    if (existingFixtureState.hasFixtureRows) {
      throw new ConflictException('An active Postmark resume fixture already exists for this tenant');
    }

    const fixtureToken = randomUUID();
    const marker = this.fixtureMarker(fixtureToken);
    const pausedUntil = new Date(now.getTime() + POSTMARK_RESUME_FIXTURE_WINDOW_MINUTES * 60 * 1000);
    const resolvedActorUserId = await this.resolveAuditActorUserId(tenantId, actorUserId);
    const customerId = randomUUID();
    const customerEmail = `postmark-resume-fixture+${fixtureToken}@example.invalid`;
    const customerDisplayName = 'Postmark Resume Fixture';

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const insertedCustomers = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `
          INSERT INTO "customers" (
            "id",
            "tenant_id",
            "external_ref",
            "email",
            "display_name",
            "created_at",
            "updated_at"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING "id"
        `,
        customerId,
        tenantId,
        marker,
        customerEmail,
        customerDisplayName,
        now,
        now
      );
      const customer = insertedCustomers[0];
      if (!customer) {
        throw new Error('Fixture customer insert did not return an id');
      }

      const campaign = await tx.campaign.create({
        data: {
          tenantId,
          campaignKey: marker,
          name: `Postmark Resume Fixture ${fixtureToken}`,
          status: 'fixture_prepared'
        }
      });

      const draftMessage = await tx.draftMessage.create({
        data: {
          tenantId,
          customerId: customer.id,
          templateVersion: POSTMARK_RESUME_FIXTURE_TEMPLATE_VERSION,
          status: 'fixture_prepared',
          bodyText: [
            'Subject: Postmark resume fixture',
            '',
            'This message is a production-safe acceptance fixture and must never be sent to a real customer.',
            `Fixture marker: ${marker}`
          ].join('\n')
        }
      });

      const sendDedupeKey = this.buildSendDedupeKey({
        tenantId,
        campaignId: campaign.id,
        customerId: customer.id,
        fixtureToken
      });

      const campaignMessage = await tx.campaignMessage.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          campaignRunId: null,
          customerId: customer.id,
          draftMessageId: draftMessage.id,
          sendDedupeKey,
          providerMessageId: null,
          status: 'PAUSED',
          deliveryState: 'QUEUED',
          claimedAt: null,
          claimedBy: null,
          sendAttempt: 0
        }
      });

      await tx.postmarkSendControl.upsert({
        where: { tenantId },
        create: {
          tenantId,
          pausedUntil,
          pauseReason: marker,
          lastErrorClass: POSTMARK_RESUME_FIXTURE_LAST_ERROR_CLASS,
          resumeChecklistAck: false,
          resumeChecklistAckActor: null,
          resumeChecklistAckAt: null,
          policyVersion: 0
        },
        update: {
          pausedUntil,
          pauseReason: marker,
          lastErrorClass: POSTMARK_RESUME_FIXTURE_LAST_ERROR_CLASS,
          resumeChecklistAck: false,
          resumeChecklistAckActor: null,
          resumeChecklistAckAt: null
        }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: resolvedActorUserId,
          action: 'OPERATOR_INTERVENTION_PREPARE_POSTMARK_RESUME_FIXTURE',
          entityType: 'operator.intervention',
          entityId: tenantId,
          metadataJson: {
            actorPresented: actorUserId,
            actorUserIdResolved: resolvedActorUserId,
            fixtureToken,
            fixtureMarker: marker,
            pausedUntil: pausedUntil.toISOString(),
            customerId: customer.id,
            campaignId: campaign.id,
            draftMessageId: draftMessage.id,
            campaignMessageId: campaignMessage.id,
            expectedRequeuedMessageCount: 1
          }
        }
      });

      return {
        fixtureToken,
        pausedUntil: pausedUntil.toISOString(),
        customerId: customer.id,
        campaignId: campaign.id,
        draftMessageId: draftMessage.id,
        campaignMessageId: campaignMessage.id,
        expectedRequeuedMessageCount: 1 as const
      };
    });
  }

  async cleanupFixture(tenantId: string, actorUserId: string | null): Promise<CleanupFixtureResult> {
    const control = await this.prisma.postmarkSendControl.findUnique({
      where: { tenantId },
      select: { pauseReason: true }
    });
    const marker = control?.pauseReason ?? null;
    if (!marker || !marker.startsWith(POSTMARK_RESUME_FIXTURE_MARKER_PREFIX)) {
      throw new ConflictException('No active Postmark resume fixture is currently paused for this tenant');
    }

    const fixtureToken = marker.slice(POSTMARK_RESUME_FIXTURE_MARKER_PREFIX.length);
    const resolvedActorUserId = await this.resolveAuditActorUserId(tenantId, actorUserId);

    const [customer, campaign, totalPausedProviderNullCount] = await Promise.all([
      this.prisma.customer.findUnique({
        where: {
          tenantId_externalRef: {
            tenantId,
            externalRef: marker
          }
        },
        select: { id: true }
      }),
      this.prisma.campaign.findUnique({
        where: {
          tenantId_campaignKey: {
            tenantId,
            campaignKey: marker
          }
        },
        select: { id: true }
      }),
      this.prisma.campaignMessage.count({
        where: {
          tenantId,
          status: 'PAUSED',
          providerMessageId: null
        }
      })
    ]);

    if (!customer || !campaign) {
      throw new ConflictException('Fixture-owned selectors did not resolve consistently');
    }

    const draftMessage = await this.prisma.draftMessage.findFirst({
      where: {
        tenantId,
        customerId: customer.id,
        templateVersion: POSTMARK_RESUME_FIXTURE_TEMPLATE_VERSION,
        status: 'fixture_prepared',
        bodyText: { contains: marker }
      },
      select: { id: true }
    });
    if (!draftMessage) {
      throw new ConflictException('Fixture-owned selectors did not resolve consistently');
    }

    const expectedSendDedupeKey = this.buildSendDedupeKey({
      tenantId,
      campaignId: campaign.id,
      customerId: customer.id,
      fixtureToken
    });
    const campaignMessage = await this.prisma.campaignMessage.findFirst({
      where: {
        tenantId,
        campaignId: campaign.id,
        customerId: customer.id,
        draftMessageId: draftMessage.id,
        sendDedupeKey: expectedSendDedupeKey,
        status: 'PAUSED',
        providerMessageId: null
      },
      select: { id: true }
    });
    if (!campaignMessage) {
      throw new ConflictException('Fixture-owned selectors did not resolve consistently');
    }
    if (totalPausedProviderNullCount > 1) {
      throw new ConflictException('Tenant has non-fixture paused provider-unclaimed messages');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deletedCampaignMessages = await tx.campaignMessage.deleteMany({
        where: { id: campaignMessage.id, tenantId }
      });
      const deletedDraftMessages = await tx.draftMessage.deleteMany({
        where: { id: draftMessage.id, tenantId }
      });
      const deletedCampaigns = await tx.campaign.deleteMany({
        where: { id: campaign.id, tenantId }
      });
      const deletedCustomers = await tx.customer.deleteMany({
        where: {
          tenantId,
          id: customer.id,
          externalRef: marker
        }
      });
      const clearedPause = await tx.postmarkSendControl.updateMany({
        where: {
          tenantId,
          pauseReason: marker
        },
        data: {
          pausedUntil: null,
          pauseReason: null,
          lastErrorClass: null,
          resumeChecklistAck: false,
          resumeChecklistAckActor: null,
          resumeChecklistAckAt: null
        }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: resolvedActorUserId,
          action: 'OPERATOR_INTERVENTION_CLEANUP_POSTMARK_RESUME_FIXTURE',
          entityType: 'operator.intervention',
          entityId: tenantId,
          metadataJson: {
            actorPresented: actorUserId,
            actorUserIdResolved: resolvedActorUserId,
            fixtureToken,
            fixtureMarker: marker,
            pauseCleared: clearedPause.count === 1,
            deletedCampaignMessageCount: deletedCampaignMessages.count,
            deletedDraftMessageCount: deletedDraftMessages.count,
            deletedCampaignCount: deletedCampaigns.count,
            deletedCustomerCount: deletedCustomers.count
          }
        }
      });

      return {
        fixtureToken,
        pauseCleared: clearedPause.count === 1,
        deletedCampaignMessageCount: deletedCampaignMessages.count,
        deletedDraftMessageCount: deletedDraftMessages.count,
        deletedCampaignCount: deletedCampaigns.count,
        deletedCustomerCount: deletedCustomers.count
      };
    });
  }

  private async resolveAuditActorUserId(tenantId: string, actorUserId: string | null): Promise<string | null> {
    if (!actorUserId) {
      return null;
    }

    const actor = await this.prisma.user.findFirst({
      where: {
        tenantId,
        id: actorUserId
      },
      select: { id: true }
    });

    return actor?.id ?? null;
  }

  private async getExistingFixtureState(tenantId: string): Promise<{ hasFixtureRows: boolean }> {
    const [control, customerCount, campaignCount] = await Promise.all([
      this.prisma.postmarkSendControl.findUnique({
        where: { tenantId },
        select: { pauseReason: true }
      }),
      this.prisma.customer.count({
        where: {
          tenantId,
          externalRef: { startsWith: POSTMARK_RESUME_FIXTURE_MARKER_PREFIX }
        }
      }),
      this.prisma.campaign.count({
        where: {
          tenantId,
          campaignKey: { startsWith: POSTMARK_RESUME_FIXTURE_MARKER_PREFIX }
        }
      })
    ]);

    return {
      hasFixtureRows:
        Boolean(control?.pauseReason?.startsWith(POSTMARK_RESUME_FIXTURE_MARKER_PREFIX)) ||
        customerCount > 0 ||
        campaignCount > 0
    };
  }

  private fixtureMarker(fixtureToken: string): string {
    return `${POSTMARK_RESUME_FIXTURE_MARKER_PREFIX}${fixtureToken}`;
  }

  private buildSendDedupeKey(input: {
    tenantId: string;
    campaignId: string;
    customerId: string;
    fixtureToken: string;
  }): string {
    return createHash('sha256')
      .update(
        `${input.tenantId}:${input.campaignId}:${input.customerId}:${POSTMARK_RESUME_FIXTURE_TEMPLATE_VERSION}:${input.fixtureToken}`
      )
      .digest('hex');
  }
}
