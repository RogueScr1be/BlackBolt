import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CampaignRunsService {
  constructor(private readonly prisma: PrismaService) {}

  async listRuns(tenantId: string, limit: number) {
    const rows = await this.prisma.campaignRun.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
      include: {
        campaign: {
          select: {
            id: true,
            campaignKey: true,
            name: true
          }
        },
        triggerReview: {
          select: {
            id: true,
            rating: true,
            reviewedAt: true,
            createdAt: true
          }
        }
      }
    });

    return {
      items: rows.map((row) => this.toSummary(row))
    };
  }

  async getRun(tenantId: string, runId: string) {
    const row = await this.prisma.campaignRun.findFirst({
      where: {
        tenantId,
        id: runId
      },
      include: {
        campaign: {
          select: {
            id: true,
            campaignKey: true,
            name: true,
            status: true
          }
        },
        triggerReview: {
          select: {
            id: true,
            rating: true,
            reviewBody: true,
            reviewerName: true,
            reviewedAt: true,
            createdAt: true
          }
        }
      }
    });

    if (!row) {
      throw new NotFoundException('Campaign run not found');
    }

    const [queued, paused, failed, sent] = await Promise.all([
      this.prisma.campaignMessage.count({ where: { tenantId, campaignRunId: runId, status: 'QUEUED' } }),
      this.prisma.campaignMessage.count({ where: { tenantId, campaignRunId: runId, status: 'PAUSED' } }),
      this.prisma.campaignMessage.count({ where: { tenantId, campaignRunId: runId, status: 'FAILED' } }),
      this.prisma.campaignMessage.count({ where: { tenantId, campaignRunId: runId, status: { in: ['SENT', 'SENT_SIMULATED'] } } })
    ]);

    return {
      ...this.toSummary(row),
      campaign: row.campaign,
      trigger_review: {
        id: row.triggerReview.id,
        rating: row.triggerReview.rating,
        body: row.triggerReview.reviewBody,
        reviewer_name: row.triggerReview.reviewerName,
        reviewed_at: row.triggerReview.reviewedAt,
        created_at: row.triggerReview.createdAt
      },
      breakdown: {
        queued,
        paused,
        sent,
        failed
      }
    };
  }

  async pauseRun(tenantId: string, runId: string, actorUserId: string | null) {
    const run = await this.prisma.campaignRun.findFirst({
      where: { tenantId, id: runId },
      select: { id: true, status: true }
    });
    if (!run) {
      throw new NotFoundException('Campaign run not found');
    }

    const updatedMessages = await this.prisma.campaignMessage.updateMany({
      where: {
        tenantId,
        campaignRunId: runId,
        status: { in: ['QUEUED', 'SENDING'] },
        providerMessageId: null
      },
      data: {
        status: 'PAUSED'
      }
    });

    const updatedRun = await this.prisma.campaignRun.update({
      where: { id: runId },
      data: {
        status: 'PAUSED'
      }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: 'CAMPAIGN_RUN_PAUSED',
        entityType: 'campaign_run',
        entityId: runId,
        metadataJson: {
          messagesPaused: updatedMessages.count,
          previousStatus: run.status
        }
      }
    });

    return {
      ok: true,
      intervention: 'pause-campaign-run',
      run_id: updatedRun.id,
      status: updatedRun.status,
      messages_paused: updatedMessages.count
    };
  }

  async resumeRun(tenantId: string, runId: string, actorUserId: string | null) {
    const run = await this.prisma.campaignRun.findFirst({
      where: { tenantId, id: runId },
      select: { id: true, status: true }
    });
    if (!run) {
      throw new NotFoundException('Campaign run not found');
    }

    const updatedMessages = await this.prisma.campaignMessage.updateMany({
      where: {
        tenantId,
        campaignRunId: runId,
        status: 'PAUSED',
        providerMessageId: null
      },
      data: {
        status: 'QUEUED'
      }
    });

    const updatedRun = await this.prisma.campaignRun.update({
      where: { id: runId },
      data: {
        status: 'RUNNING',
        finishedAt: null,
        startedAt: run.status === 'QUEUED' ? new Date() : undefined,
        lastErrorCode: null,
        lastErrorMessage: null
      }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: 'CAMPAIGN_RUN_RESUMED',
        entityType: 'campaign_run',
        entityId: runId,
        metadataJson: {
          messagesResumed: updatedMessages.count,
          previousStatus: run.status
        }
      }
    });

    return {
      ok: true,
      intervention: 'resume-campaign-run',
      run_id: updatedRun.id,
      status: updatedRun.status,
      messages_resumed: updatedMessages.count
    };
  }

  private toSummary(row: {
    id: string;
    status: string;
    segmentMode: string;
    sendWindowAt: Date;
    recipientsTotal: number;
    messagesQueued: number;
    messagesSent: number;
    messagesFailed: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    campaign: { id: string; campaignKey: string; name: string };
    triggerReview: { id: string; rating: number | null; reviewedAt: Date | null; createdAt: Date };
  }) {
    return {
      id: row.id,
      status: row.status,
      segment_mode: row.segmentMode,
      send_window_at: row.sendWindowAt,
      recipients_total: row.recipientsTotal,
      messages_queued: row.messagesQueued,
      messages_sent: row.messagesSent,
      messages_failed: row.messagesFailed,
      last_error_code: row.lastErrorCode,
      last_error_message: row.lastErrorMessage,
      started_at: row.startedAt,
      finished_at: row.finishedAt,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      campaign: row.campaign,
      trigger_review: {
        id: row.triggerReview.id,
        rating: row.triggerReview.rating,
        reviewed_at: row.triggerReview.reviewedAt,
        created_at: row.triggerReview.createdAt
      }
    };
  }
}
