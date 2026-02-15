import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queues/queue.constants';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async setGbpIntegration(input: {
    tenantId: string;
    actorUserId?: string | null;
    gbpAccountId: string;
    gbpLocationId: string;
    gbpAccessTokenRef: string;
    reason?: string;
  }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const updated = await this.prisma.tenant.update({
      where: { id: input.tenantId },
      data: {
        gbpAccountId: input.gbpAccountId,
        gbpLocationId: input.gbpLocationId,
        gbpAccessTokenRef: input.gbpAccessTokenRef,
        gbpIntegrationStatus: 'CONNECTED'
      }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? null,
        action: 'GBP_INTEGRATION_UPDATED',
        entityType: 'tenant.integration.gbp',
        entityId: input.tenantId,
        metadataJson: {
          reason: input.reason ?? 'manual_update',
          before: {
            gbpAccountId: tenant.gbpAccountId,
            gbpLocationId: tenant.gbpLocationId,
            gbpAccessTokenRef: tenant.gbpAccessTokenRef,
            gbpIntegrationStatus: tenant.gbpIntegrationStatus
          },
          after: {
            gbpAccountId: updated.gbpAccountId,
            gbpLocationId: updated.gbpLocationId,
            gbpAccessTokenRef: updated.gbpAccessTokenRef,
            gbpIntegrationStatus: updated.gbpIntegrationStatus
          }
        }
      }
    });

    return {
      tenantId: updated.id,
      gbpAccountId: updated.gbpAccountId,
      gbpLocationId: updated.gbpLocationId,
      gbpAccessTokenRef: updated.gbpAccessTokenRef,
      gbpIntegrationStatus: updated.gbpIntegrationStatus
    };
  }

  async getGbpOperatorSummary(input: { tenantId: string }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: {
        id: true,
        gbpLocationId: true,
        gbpIntegrationStatus: true
      }
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const syncState = tenant.gbpLocationId
      ? await this.prisma.gbpSyncState.findUnique({
          where: {
            tenantId_locationId: {
              tenantId: input.tenantId,
              locationId: tenant.gbpLocationId
            }
          }
        })
      : null;

    const latestRunRow = await this.prisma.jobRun.findFirst({
      where: {
        tenantId: input.tenantId,
        queueName: QUEUES.GBP_INGEST
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        state: true,
        errorCode: true,
        errorMessage: true,
        metadataJson: true,
        createdAt: true,
        finishedAt: true
      }
    });

    const latestRun = latestRunRow
      ? {
          ...latestRunRow,
          state: latestRunRow.state.toLowerCase()
        }
      : null;

    const alerts = await this.prisma.integrationAlert.findMany({
      where: {
        tenantId: input.tenantId,
        integration: 'GBP'
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        code: true,
        severity: true,
        message: true,
        createdAt: true,
        resolvedAt: true
      }
    });

    return {
      tenantId: input.tenantId,
      gbpIntegrationStatus: tenant.gbpIntegrationStatus,
      cooldownUntil: syncState?.cooldownUntil ?? null,
      lastSuccessAt: syncState?.lastSuccessAt ?? null,
      latestJobRun: latestRun,
      alerts
    };
  }
}
