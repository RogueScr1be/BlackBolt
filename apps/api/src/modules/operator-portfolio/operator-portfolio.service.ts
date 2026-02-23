import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type CustomerSegment } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  classifyReview,
  enforceDraftPolicy,
  nextBusinessDayAt10Local,
  parseDraftBody,
  renderDraftBody,
  segmentLabelToMode,
  segmentModeToLabel,
  segmentsForMode,
  type ReactivationSegmentMode
} from '../reviews/reactivation.workflow';

type ApprovalState = 'awaiting_approval' | 'approved' | 'rejected';

@Injectable()
export class OperatorPortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async listPortfolioTenants(allowedTenantIds: string[]) {
    if (allowedTenantIds.length === 0) {
      return { items: [] };
    }

    const [tenants, alertRollup] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { id: { in: allowedTenantIds } },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true
        }
      }),
      this.prisma.integrationAlert.groupBy({
        by: ['tenantId'],
        where: {
          tenantId: { in: allowedTenantIds },
          resolvedAt: null
        },
        _count: { _all: true }
      })
    ]);

    const alertsByTenant = new Map(alertRollup.map((row) => [row.tenantId, row._count._all]));
    return {
      items: tenants.map((tenant) => {
        const actionRequiredCount = alertsByTenant.get(tenant.id) ?? 0;
        const healthScore = Math.max(0, 100 - actionRequiredCount * 10);
        return {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          health_score: healthScore,
          action_required_count: actionRequiredCount
        };
      })
    };
  }

  async listReviewQueue(input: {
    allowedTenantIds: string[];
    tenantId?: string;
    state?: string;
    since?: string;
  }) {
    const tenantId = this.resolveTenantScope(input.allowedTenantIds, input.tenantId);
    const state = this.normalizeQueueState(input.state);
    const since = this.parseOptionalIsoDate(input.since, 'since');

    const rows = await this.prisma.reviewQueueItem.findMany({
      where: {
        tenantId: tenantId ? tenantId : { in: input.allowedTenantIds },
        ...(state ? { state } : {}),
        ...(since ? { updatedAt: { gte: since } } : {})
      },
      include: {
        campaignRun: {
          select: {
            id: true,
            status: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 300
    });

    const runIds = [...new Set(rows.map((row) => row.campaignRunId).filter((value): value is string => Boolean(value)))];
    const approvals =
      runIds.length === 0
        ? []
        : await this.prisma.approvalItem.findMany({
            where: {
              tenantId: tenantId ? tenantId : { in: input.allowedTenantIds },
              campaignRunId: { in: runIds }
            },
            select: {
              id: true,
              campaignRunId: true
            }
          });
    const approvalByRunId = new Map(approvals.map((row) => [row.campaignRunId ?? '', row]));

    return {
      items: rows.map((row) => ({
        id: row.id,
        tenant_id: row.tenantId,
        review_id: row.reviewId,
        trigger_review_id: row.triggerReviewId ?? row.reviewId,
        campaign_run_id: row.campaignRunId,
        approval_id: row.campaignRunId ? approvalByRunId.get(row.campaignRunId)?.id ?? null : null,
        state: row.state,
        rating: row.rating,
        service_mentioned: row.serviceMentioned,
        key_benefit: row.keyBenefit,
        confidence: Number(row.confidence),
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
        classified_at: row.classifiedAt?.toISOString() ?? null,
        awaiting_approval_at: row.awaitingApprovalAt?.toISOString() ?? null,
        scheduled_at: row.scheduledAt?.toISOString() ?? null,
        sent_at: row.sentAt?.toISOString() ?? null
      }))
    };
  }

  async listApprovals(input: { allowedTenantIds: string[]; tenantId?: string; state?: string }) {
    const tenantId = this.resolveTenantScope(input.allowedTenantIds, input.tenantId);
    const status = this.normalizeApprovalStatus(input.state);

    const rows = await this.prisma.approvalItem.findMany({
      where: {
        tenantId: tenantId ? tenantId : { in: input.allowedTenantIds },
        campaignRunId: { not: null },
        ...(status ? { status } : {})
      },
      include: {
        draftMessage: {
          select: {
            bodyText: true,
            reviewId: true
          }
        },
        campaignRun: {
          select: {
            id: true,
            triggerReviewId: true,
            status: true,
            segmentMode: true,
            sendWindowAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 300
    });

    return {
      items: rows.map((row) => {
        const parsedDraft = parseDraftBody(row.draftMessage.bodyText);
        const effectiveSegment = segmentModeToLabel(
          segmentLabelToMode(row.segmentMode ?? row.campaignRun?.segmentMode ?? 'last_seen_90_365')
        );
        return {
          id: row.id,
          tenant_id: row.tenantId,
          campaign_run_id: row.campaignRunId,
          trigger_review_id: row.campaignRun?.triggerReviewId ?? row.draftMessage.reviewId,
          state: this.toApprovalState(row.status),
          subject: row.subjectLine ?? parsedDraft.subject ?? 'A quick thank-you from our team',
          body: row.bodyText ?? parsedDraft.body,
          segment: effectiveSegment,
          send_window_at: (row.sendWindowAt ?? row.campaignRun?.sendWindowAt)?.toISOString() ?? null,
          created_at: row.createdAt.toISOString(),
          updated_at: row.updatedAt.toISOString()
        };
      })
    };
  }

  async getApproval(input: { allowedTenantIds: string[]; approvalId: string }) {
    const row = await this.findScopedApproval(input.allowedTenantIds, input.approvalId);
    const counts = row.campaignRunId
      ? await this.countRunMessageStates(row.tenantId, row.campaignRunId)
      : { queued: 0, paused: 0, sent: 0, failed: 0, total: 0 };

    const parsedDraft = parseDraftBody(row.draftMessage.bodyText);
    const segment = segmentModeToLabel(segmentLabelToMode(row.segmentMode ?? row.campaignRun?.segmentMode ?? 'last_seen_90_365'));

    return {
      id: row.id,
      tenant_id: row.tenantId,
      campaign_run_id: row.campaignRunId,
      trigger_review_id: row.campaignRun?.triggerReviewId ?? row.draftMessage.reviewId,
      state: this.toApprovalState(row.status),
      required_role: row.requiredRole,
      draft: {
        subject: row.subjectLine ?? parsedDraft.subject ?? 'A quick thank-you from our team',
        body: row.bodyText ?? parsedDraft.body,
        segment,
        send_window_at: (row.sendWindowAt ?? row.campaignRun?.sendWindowAt)?.toISOString() ?? null
      },
      counts,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      approved_at: row.approvedAt?.toISOString() ?? null,
      rejected_at: row.rejectedAt?.toISOString() ?? null
    };
  }

  async patchApprovalDraft(input: {
    allowedTenantIds: string[];
    approvalId: string;
    actorUserId: string | null;
    subject?: string;
    body?: string;
    segment?: string;
    sendWindowAt?: string;
  }) {
    const approval = await this.findScopedApproval(input.allowedTenantIds, input.approvalId);
    if (approval.status !== 'queued') {
      throw new BadRequestException('Approval is closed');
    }

    const parsed = parseDraftBody(approval.draftMessage.bodyText);
    const subjectCandidate = input.subject ?? approval.subjectLine ?? parsed.subject ?? 'A quick thank-you from our team';
    const bodyCandidate = input.body ?? approval.bodyText ?? parsed.body;
    const policy = enforceDraftPolicy({
      subject: subjectCandidate,
      body: bodyCandidate
    });
    if (policy.blocked.length > 0) {
      throw new BadRequestException(`Draft contains disallowed content: ${policy.blocked.join(', ')}`);
    }

    const segmentMode = segmentLabelToMode(input.segment ?? approval.segmentMode ?? approval.campaignRun?.segmentMode ?? 'default');
    const segmentLabel = segmentModeToLabel(segmentMode);
    const sendWindowAt =
      input.sendWindowAt !== undefined
        ? this.parseOptionalIsoDate(input.sendWindowAt, 'send_window_at')
        : (approval.sendWindowAt ?? approval.campaignRun?.sendWindowAt ?? null);

    await this.prisma.$transaction(async (tx) => {
      await tx.approvalItem.update({
        where: { id: approval.id },
        data: {
          subjectLine: policy.subject,
          bodyText: policy.body,
          segmentMode: segmentLabel,
          sendWindowAt: sendWindowAt ?? undefined
        }
      });

      if (approval.campaignRunId) {
        await tx.campaignRun.update({
          where: { id: approval.campaignRunId },
          data: {
            segmentMode,
            ...(sendWindowAt ? { sendWindowAt } : {})
          }
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: approval.tenantId,
          actorUserId: input.actorUserId,
          action: 'OPERATOR_APPROVAL_DRAFT_PATCHED',
          entityType: 'approval_item',
          entityId: approval.id,
          metadataJson: {
            segment: segmentLabel,
            sendWindowAt: sendWindowAt?.toISOString() ?? null
          }
        }
      });
    });

    return this.getApproval({ allowedTenantIds: input.allowedTenantIds, approvalId: approval.id });
  }

  async approveApproval(input: { allowedTenantIds: string[]; approvalId: string; actorUserId: string | null }) {
    const approval = await this.findScopedApproval(input.allowedTenantIds, input.approvalId);
    if (approval.status !== 'queued') {
      throw new BadRequestException('Approval is closed');
    }
    if (!approval.campaignRunId) {
      throw new BadRequestException('Approval has no campaign run');
    }

    const parsed = parseDraftBody(approval.draftMessage.bodyText);
    const subjectCandidate = approval.subjectLine ?? parsed.subject ?? 'A quick thank-you from our team';
    const bodyCandidate = approval.bodyText ?? parsed.body;
    const policy = enforceDraftPolicy({ subject: subjectCandidate, body: bodyCandidate });
    if (policy.blocked.length > 0) {
      throw new BadRequestException(`Draft contains disallowed content: ${policy.blocked.join(', ')}`);
    }

    const resolvedPolicy = await this.resolveReactivationPolicy(approval.tenantId);
    const segmentMode = segmentLabelToMode(approval.segmentMode ?? approval.campaignRun?.segmentMode ?? segmentModeToLabel(resolvedPolicy.segmentMode));
    const segmentLabel = segmentModeToLabel(segmentMode);
    const sendWindowAt =
      approval.sendWindowAt ??
      approval.campaignRun?.sendWindowAt ??
      nextBusinessDayAt10Local({ timeZone: resolvedPolicy.timeZone ?? 'UTC' });

    const now = new Date();
    const destination = process.env.REACTIVATION_LINK_DESTINATION ?? 'https://example.com/book';

    const result = await this.prisma.$transaction(async (tx) => {
      const recipients = await tx.customer.findMany({
        where: {
          tenantId: approval.tenantId,
          segment: { in: segmentsForMode(segmentMode) as CustomerSegment[] }
        },
        orderBy: { updatedAt: 'desc' },
        take: resolvedPolicy.maxRecipients
      });

      const existingMessages = await tx.campaignMessage.findMany({
        where: {
          tenantId: approval.tenantId,
          campaignRunId: approval.campaignRunId
        },
        select: {
          id: true,
          draftMessageId: true
        }
      });
      const messageIds = existingMessages.map((message) => message.id);
      const staleDraftIds = [...new Set(existingMessages.map((message) => message.draftMessageId).filter((id): id is string => Boolean(id)))].filter(
        (id) => id !== approval.draftMessageId
      );

      if (messageIds.length > 0) {
        await tx.linkCode.deleteMany({ where: { tenantId: approval.tenantId, campaignMessageId: { in: messageIds } } });
        await tx.campaignMessage.deleteMany({ where: { tenantId: approval.tenantId, id: { in: messageIds } } });
      }
      if (staleDraftIds.length > 0) {
        await tx.draftMessage.deleteMany({ where: { tenantId: approval.tenantId, id: { in: staleDraftIds } } });
      }

      let queuedCount = 0;
      let firstDraftUsed = false;

      for (const recipient of recipients) {
        const linkCode = this.shortLinkCode({
          tenantId: approval.tenantId,
          reviewId: approval.campaignRun!.triggerReviewId,
          runId: approval.campaignRunId!,
          recipientId: recipient.id
        });
        const trackedDestination = `${destination}${destination.includes('?') ? '&' : '?'}bb_ref=${linkCode}`;
        const draftBody = renderDraftBody({
          subject: policy.subject,
          body: policy.body,
          linkCode
        });

        const draft = firstDraftUsed
          ? await tx.draftMessage.create({
              data: {
                tenantId: approval.tenantId,
                reviewId: approval.campaignRun!.triggerReviewId,
                customerId: recipient.id,
                templateVersion: 'reactivation-v1',
                status: 'approved',
                bodyText: draftBody
              }
            })
          : await tx.draftMessage.update({
              where: { id: approval.draftMessageId },
              data: {
                reviewId: approval.campaignRun!.triggerReviewId,
                customerId: recipient.id,
                templateVersion: 'reactivation-v1',
                status: 'approved',
                bodyText: draftBody
              }
            });

        firstDraftUsed = true;

        const sendDedupeKey = createHash('sha256')
          .update(`${approval.tenantId}:${approval.campaignRun!.campaignId}:${recipient.id}:reactivation-v1:${sendWindowAt.toISOString()}`)
          .digest('hex');

        const message = await tx.campaignMessage.create({
          data: {
            tenantId: approval.tenantId,
            campaignId: approval.campaignRun!.campaignId,
            campaignRunId: approval.campaignRunId!,
            customerId: recipient.id,
            draftMessageId: draft.id,
            sendDedupeKey,
            status: 'QUEUED',
            deliveryState: 'QUEUED'
          }
        });

        await tx.linkCode.upsert({
          where: {
            tenantId_code: {
              tenantId: approval.tenantId,
              code: linkCode
            }
          },
          update: {
            campaignMessageId: message.id,
            destinationUrl: trackedDestination
          },
          create: {
            tenantId: approval.tenantId,
            campaignMessageId: message.id,
            code: linkCode,
            destinationUrl: trackedDestination
          }
        });

        queuedCount += 1;
      }

      await tx.approvalItem.update({
        where: { id: approval.id },
        data: {
          status: 'approved',
          approvedAt: now,
          approvedByUserId: null,
          rejectedAt: null,
          rejectedByUserId: null,
          rejectionReason: null,
          subjectLine: policy.subject,
          bodyText: policy.body,
          segmentMode: segmentLabel,
          sendWindowAt
        }
      });

      await tx.campaignRun.update({
        where: { id: approval.campaignRunId! },
        data: {
          status: queuedCount > 0 ? 'RUNNING' : 'PAUSED',
          segmentMode,
          sendWindowAt,
          recipientsTotal: queuedCount,
          messagesQueued: queuedCount,
          messagesSent: 0,
          messagesFailed: 0,
          startedAt: now,
          finishedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null
        }
      });

      await tx.reviewQueueItem.updateMany({
        where: {
          tenantId: approval.tenantId,
          campaignRunId: approval.campaignRunId!
        },
        data: {
          state: 'scheduled',
          scheduledAt: now,
          updatedAt: now
        }
      });

      await tx.auditLog.create({
        data: {
          tenantId: approval.tenantId,
          actorUserId: input.actorUserId,
          action: 'OPERATOR_APPROVAL_APPROVED',
          entityType: 'approval_item',
          entityId: approval.id,
          metadataJson: {
            campaignRunId: approval.campaignRunId,
            queuedCount,
            segment: segmentLabel,
            sendWindowAt: sendWindowAt.toISOString()
          }
        }
      });

      return {
        approval_id: approval.id,
        campaign_run_id: approval.campaignRunId,
        queued_count: queuedCount
      };
    });

    return {
      ok: true,
      ...result
    };
  }

  async rejectApproval(input: {
    allowedTenantIds: string[];
    approvalId: string;
    actorUserId: string | null;
    reason?: string;
  }) {
    const approval = await this.findScopedApproval(input.allowedTenantIds, input.approvalId);
    if (approval.status !== 'queued') {
      throw new BadRequestException('Approval is closed');
    }
    if (!approval.campaignRunId) {
      throw new BadRequestException('Approval has no campaign run');
    }

    const now = new Date();
    const reason = input.reason?.trim() || 'Rejected by operator';

    await this.prisma.$transaction(async (tx) => {
      await tx.approvalItem.update({
        where: { id: approval.id },
        data: {
          status: 'rejected',
          approvedAt: null,
          approvedByUserId: null,
          rejectedAt: now,
          rejectedByUserId: input.actorUserId ?? 'operator',
          rejectionReason: reason
        }
      });

      await tx.campaignRun.update({
        where: { id: approval.campaignRunId! },
        data: {
          status: 'PAUSED',
          finishedAt: now,
          lastErrorCode: 'APPROVAL_REJECTED',
          lastErrorMessage: reason
        }
      });

      await tx.campaignMessage.updateMany({
        where: {
          tenantId: approval.tenantId,
          campaignRunId: approval.campaignRunId!,
          status: { in: ['QUEUED', 'SENDING'] },
          providerMessageId: null
        },
        data: {
          status: 'PAUSED'
        }
      });

      await tx.reviewQueueItem.updateMany({
        where: {
          tenantId: approval.tenantId,
          campaignRunId: approval.campaignRunId!
        },
        data: {
          state: 'classified',
          updatedAt: now
        }
      });

      await tx.auditLog.create({
        data: {
          tenantId: approval.tenantId,
          actorUserId: input.actorUserId,
          action: 'OPERATOR_APPROVAL_REJECTED',
          entityType: 'approval_item',
          entityId: approval.id,
          metadataJson: {
            campaignRunId: approval.campaignRunId,
            reason
          }
        }
      });
    });

    return {
      ok: true,
      approval_id: approval.id,
      campaign_run_id: approval.campaignRunId,
      rejected_at: now.toISOString()
    };
  }

  async retriggerReactivationRun(input: {
    allowedTenantIds: string[];
    reviewId: string;
    tenantId?: string;
    actorUserId: string | null;
  }) {
    const review = await this.prisma.review.findFirst({
      where: {
        id: input.reviewId,
        ...(input.tenantId ? { tenantId: input.tenantId } : {})
      },
      select: {
        id: true,
        tenantId: true,
        rating: true,
        reviewBody: true
      }
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    this.assertAllowedTenant(input.allowedTenantIds, review.tenantId);

    const classification = classifyReview({
      rating: review.rating,
      reviewBody: review.reviewBody
    });
    if (!classification.isGenuinePositive) {
      throw new BadRequestException('Only genuine-positive 5-star reviews can start reactivation runs');
    }

    const existing = await this.prisma.reviewQueueItem.findFirst({
      where: {
        tenantId: review.tenantId,
        reviewId: review.id,
        state: { in: ['awaiting_approval', 'scheduled'] }
      },
      select: { id: true, campaignRunId: true, state: true }
    });
    if (existing) {
      return {
        ok: true,
        existing: true,
        queue_item_id: existing.id,
        campaign_run_id: existing.campaignRunId,
        state: existing.state
      };
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: review.tenantId,
        actorUserId: input.actorUserId,
        action: 'OPERATOR_REACTIVATION_RETRIGGER_REQUESTED',
        entityType: 'review',
        entityId: review.id,
        metadataJson: {
          source: 'operator_manual'
        }
      }
    });

    return {
      ok: true,
      existing: false,
      review_id: review.id,
      tenant_id: review.tenantId,
      note: 'Review will be picked up on next ingestion cycle. Use poll endpoint for immediate GBP sync.'
    };
  }

  private async findScopedApproval(allowedTenantIds: string[], approvalId: string) {
    const approval = await this.prisma.approvalItem.findFirst({
      where: {
        id: approvalId,
        tenantId: { in: allowedTenantIds }
      },
      include: {
        draftMessage: {
          select: {
            id: true,
            bodyText: true,
            reviewId: true
          }
        },
        campaignRun: {
          select: {
            id: true,
            campaignId: true,
            triggerReviewId: true,
            status: true,
            segmentMode: true,
            sendWindowAt: true
          }
        }
      }
    });
    if (!approval) {
      throw new NotFoundException('Approval not found');
    }
    return approval;
  }

  private async countRunMessageStates(tenantId: string, runId: string) {
    const [queued, paused, sent, failed] = await Promise.all([
      this.prisma.campaignMessage.count({
        where: {
          tenantId,
          campaignRunId: runId,
          status: { in: ['QUEUED', 'SENDING'] }
        }
      }),
      this.prisma.campaignMessage.count({
        where: {
          tenantId,
          campaignRunId: runId,
          status: 'PAUSED'
        }
      }),
      this.prisma.campaignMessage.count({
        where: {
          tenantId,
          campaignRunId: runId,
          status: { in: ['SENT', 'SENT_SIMULATED'] }
        }
      }),
      this.prisma.campaignMessage.count({
        where: {
          tenantId,
          campaignRunId: runId,
          status: 'FAILED'
        }
      })
    ]);
    return {
      queued,
      paused,
      sent,
      failed,
      total: queued + paused + sent + failed
    };
  }

  private toApprovalState(status: string): ApprovalState {
    if (status === 'approved') {
      return 'approved';
    }
    if (status === 'rejected') {
      return 'rejected';
    }
    return 'awaiting_approval';
  }

  private normalizeApprovalStatus(state: string | undefined): 'queued' | 'approved' | 'rejected' | null {
    if (!state || state === 'all') {
      return null;
    }
    if (['awaiting_approval', 'queued', 'pending', 'open'].includes(state)) {
      return 'queued';
    }
    if (state === 'approved' || state === 'rejected') {
      return state;
    }
    throw new BadRequestException('state must be awaiting_approval, approved, rejected, or all');
  }

  private normalizeQueueState(state: string | undefined): string | null {
    if (!state || state === 'all') {
      return null;
    }
    const allowed = ['new', 'classified', 'awaiting_approval', 'scheduled', 'sent'];
    if (!allowed.includes(state)) {
      throw new BadRequestException('state must be new, classified, awaiting_approval, scheduled, sent, or all');
    }
    return state;
  }

  private parseOptionalIsoDate(value: string | undefined, field: string): Date | null {
    if (value === undefined) {
      return null;
    }
    if (value.trim().length === 0) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be an ISO date-time string`);
    }
    return parsed;
  }

  private resolveTenantScope(allowedTenantIds: string[], tenantId?: string) {
    if (!tenantId) {
      return null;
    }
    this.assertAllowedTenant(allowedTenantIds, tenantId);
    return tenantId;
  }

  private assertAllowedTenant(allowedTenantIds: string[], tenantId: string) {
    if (!allowedTenantIds.includes(tenantId)) {
      throw new ForbiddenException('Tenant is not in operator portfolio scope');
    }
  }

  private async resolveReactivationPolicy(tenantId: string): Promise<{
    segmentMode: ReactivationSegmentMode;
    maxRecipients: number;
    timeZone: string;
  }> {
    const [policyRow, tenant] = await Promise.all([
      this.prisma.tenantPolicy.findUnique({
        where: {
          tenantId_policyKey: {
            tenantId,
            policyKey: 'reactivation_automation'
          }
        },
        select: { policyJson: true }
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { timeZone: true }
      })
    ]);

    const json = (policyRow?.policyJson as Record<string, unknown> | null) ?? {};
    const segmentModeRaw = typeof json['segmentMode'] === 'string' ? json['segmentMode'] : 'default';
    const segmentMode = (['default', 'volume', 'gentle'].includes(segmentModeRaw) ? segmentModeRaw : 'default') as ReactivationSegmentMode;
    const maxRecipients =
      typeof json['maxRecipients'] === 'number' ? Math.max(1, Math.min(200, Math.floor(json['maxRecipients']))) : 50;

    return {
      segmentMode,
      maxRecipients,
      timeZone: tenant?.timeZone ?? 'UTC'
    };
  }

  private shortLinkCode(input: { tenantId: string; reviewId: string; runId: string; recipientId: string }) {
    return createHash('sha256')
      .update(`${input.tenantId}:${input.reviewId}:${input.runId}:${input.recipientId}:reactivation-v1`)
      .digest('base64url')
      .slice(0, 10)
      .toLowerCase();
  }
}
