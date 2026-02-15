import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRevenueEventInput, RevenueSummaryInput } from './revenue.types';

@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  async createRevenueEvent(input: CreateRevenueEventInput) {
    const occurredAt = this.parseDateOrThrow(input.occurredAt, 'occurredAt');
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    const currency = input.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('currency must be a 3-letter ISO code');
    }

    try {
      const created = await this.prisma.revenueEvent.create({
        data: {
          tenantId: input.tenantId,
          occurredAt,
          amountCents: input.amountCents,
          currency,
          kind: input.kind,
          source: input.source,
          externalId: input.externalId ?? null,
          customerId: input.customerId ?? null,
          description: input.description ?? null,
          idempotencyKey: input.idempotencyKey,
          redactedMetadata: input.redactedMetadata
            ? (input.redactedMetadata as Prisma.InputJsonValue)
            : Prisma.JsonNull
        },
        select: { id: true, amountCents: true, currency: true }
      });

      const attributedToCampaignMessageId = await this.resolveAttributionCampaignMessageId(input);
      if (attributedToCampaignMessageId) {
        await this.ensureAttribution({
          tenantId: input.tenantId,
          revenueEventId: created.id,
          campaignMessageId: attributedToCampaignMessageId,
          attributedCents: created.amountCents
        });
      }

      return {
        revenueEventId: created.id,
        deduped: false,
        attributionCreated: Boolean(attributedToCampaignMessageId),
        attributedToCampaignMessageId: attributedToCampaignMessageId ?? null
      };
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') {
        throw error;
      }

      const existing = await this.prisma.revenueEvent.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: input.tenantId,
            idempotencyKey: input.idempotencyKey
          }
        },
        select: { id: true, amountCents: true }
      });

      if (!existing) {
        throw new ConflictException('Duplicate idempotency key');
      }

      const attributedToCampaignMessageId = await this.resolveAttributionCampaignMessageId(input);
      if (attributedToCampaignMessageId) {
        await this.ensureAttribution({
          tenantId: input.tenantId,
          revenueEventId: existing.id,
          campaignMessageId: attributedToCampaignMessageId,
          attributedCents: existing.amountCents
        });
      }

      return {
        revenueEventId: existing.id,
        deduped: true,
        attributionCreated: Boolean(attributedToCampaignMessageId),
        attributedToCampaignMessageId: attributedToCampaignMessageId ?? null
      };
    }
  }

  async getRevenueSummary(input: RevenueSummaryInput) {
    const from = input.from ? this.parseDateOrThrow(input.from, 'from') : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = input.to ? this.parseDateOrThrow(input.to, 'to') : new Date();
    if (from >= to) {
      throw new BadRequestException('from must be before to');
    }

    const diagnosticsEnabled = process.env.REVENUE_OPS_DIAGNOSTICS === '1';
    const startedAt = Date.now();
    let prismaCalls = 0;
    const counted = <T>(promise: Promise<T>): Promise<T> => {
      prismaCalls += 1;
      return promise;
    };

    const eventsWhere = {
      tenantId: input.tenantId,
      occurredAt: { gte: from, lt: to }
    };

    const last1hFrom = new Date(to.getTime() - 60 * 60 * 1000);
    const last24hFrom = new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const [eventTotals, directTotals, assistedTotals, currencyBuckets, topCampaignRows, events1h, attributed1h, events24h, attributed24h] = await Promise.all([
      counted(
        this.prisma.revenueEvent.aggregate({
          where: eventsWhere,
          _sum: { amountCents: true },
          _count: { _all: true }
        })
      ),
      counted(
        this.prisma.revenueAttribution.aggregate({
          where: {
            tenantId: input.tenantId,
            isDirect: true,
            revenueEvent: { occurredAt: { gte: from, lt: to } }
          },
          _sum: { attributedCents: true }
        })
      ),
      counted(
        this.prisma.revenueAttribution.aggregate({
          where: {
            tenantId: input.tenantId,
            isDirect: false,
            revenueEvent: { occurredAt: { gte: from, lt: to } }
          },
          _sum: { attributedCents: true }
        })
      ),
      counted(
        this.prisma.revenueEvent.groupBy({
          by: ['currency'],
          where: eventsWhere,
          _sum: { amountCents: true },
          orderBy: { currency: 'asc' }
        })
      ),
      counted(
        this.prisma.revenueAttribution.groupBy({
          by: ['campaignMessageId'],
          where: {
            tenantId: input.tenantId,
            revenueEvent: { occurredAt: { gte: from, lt: to } }
          },
          _sum: { attributedCents: true },
          orderBy: { _sum: { attributedCents: 'desc' } },
          take: 5
        })
      ),
      counted(
        this.prisma.revenueEvent.aggregate({
          where: {
            tenantId: input.tenantId,
            occurredAt: { gte: last1hFrom, lt: to }
          },
          _sum: { amountCents: true }
        })
      ),
      counted(
        this.prisma.revenueAttribution.aggregate({
          where: {
            tenantId: input.tenantId,
            revenueEvent: { occurredAt: { gte: last1hFrom, lt: to } }
          },
          _sum: { attributedCents: true }
        })
      ),
      counted(
        this.prisma.revenueEvent.aggregate({
          where: {
            tenantId: input.tenantId,
            occurredAt: { gte: last24hFrom, lt: to }
          },
          _sum: { amountCents: true }
        })
      ),
      counted(
        this.prisma.revenueAttribution.aggregate({
          where: {
            tenantId: input.tenantId,
            revenueEvent: { occurredAt: { gte: last24hFrom, lt: to } }
          },
          _sum: { attributedCents: true }
        })
      )
    ]);

    const campaignIds = topCampaignRows.map((row) => row.campaignMessageId);
    const campaignsById = campaignIds.length
      ? await counted(
          this.prisma.campaignMessage.findMany({
            where: {
              tenantId: input.tenantId,
              id: { in: campaignIds }
            },
            select: {
              id: true,
              campaign: {
                select: {
                  id: true,
                  campaignKey: true
                }
              }
            }
          })
        )
      : [];

    const campaignMap = new Map(campaignsById.map((row) => [row.id, row]));
    const currency = currencyBuckets.length === 1 ? currencyBuckets[0].currency : 'MIX';

    const totalCents = eventTotals._sum.amountCents ?? 0;
    const directCents = directTotals._sum.attributedCents ?? 0;
    const assistedCents = assistedTotals._sum.attributedCents ?? 0;
    const unattributedCents = Math.max(0, totalCents - directCents - assistedCents);

    const response = {
      tenantId: input.tenantId,
      model: 'LAST_TOUCH' as const,
      windowDaysDirect: 7 as const,
      windowDaysAssisted: 30 as const,
      range: {
        from: from.toISOString(),
        to: to.toISOString()
      },
      rollup: {
        total: { amountCents: totalCents, currency },
        direct: { amountCents: directCents, currency },
        assisted: { amountCents: assistedCents, currency },
        unattributed: { amountCents: unattributedCents, currency }
      },
      topCampaigns: topCampaignRows
        .map((row) => {
          const mapped = campaignMap.get(row.campaignMessageId);
          if (!mapped?.campaign) {
            return null;
          }
          const amount = row._sum.attributedCents ?? 0;
          return {
            campaignId: mapped.campaign.id,
            campaignKey: mapped.campaign.campaignKey,
            attributed: { amountCents: amount, currency },
            direct: { amountCents: 0, currency },
            assisted: { amountCents: amount, currency }
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
      proof: {
        last1h: {
          totalCents: events1h._sum.amountCents ?? 0,
          attributedCents: attributed1h._sum.attributedCents ?? 0,
          unattributedCents: Math.max(0, (events1h._sum.amountCents ?? 0) - (attributed1h._sum.attributedCents ?? 0))
        },
        last24h: {
          totalCents: events24h._sum.amountCents ?? 0,
          attributedCents: attributed24h._sum.attributedCents ?? 0,
          unattributedCents: Math.max(0, (events24h._sum.amountCents ?? 0) - (attributed24h._sum.attributedCents ?? 0))
        }
      }
    };

    if (!diagnosticsEnabled) {
      return response;
    }

    return {
      ...response,
      diagnostics: {
        durationMs: Date.now() - startedAt,
        prismaCalls
      }
    };
  }

  private parseDateOrThrow(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date-time`);
    }
    return parsed;
  }

  private async resolveAttributionCampaignMessageId(input: CreateRevenueEventInput): Promise<string | null> {
    if (input.campaignMessageId) {
      const match = await this.prisma.campaignMessage.findFirst({
        where: {
          tenantId: input.tenantId,
          id: input.campaignMessageId
        },
        select: { id: true }
      });
      return match?.id ?? null;
    }

    if (input.linkCode) {
      const link = await this.prisma.linkCode.findUnique({
        where: {
          tenantId_code: {
            tenantId: input.tenantId,
            code: input.linkCode
          }
        },
        select: { campaignMessageId: true }
      });
      if (link?.campaignMessageId) {
        return link.campaignMessageId;
      }
    }

    if (input.providerMessageId) {
      const campaignMessage = await this.prisma.campaignMessage.findUnique({
        where: {
          tenantId_providerMessageId: {
            tenantId: input.tenantId,
            providerMessageId: input.providerMessageId
          }
        },
        select: { id: true }
      });
      return campaignMessage?.id ?? null;
    }

    return null;
  }

  private async ensureAttribution(input: {
    tenantId: string;
    revenueEventId: string;
    campaignMessageId: string;
    attributedCents: number;
  }) {
    const dedupeKey = `last-touch:${input.revenueEventId}:${input.campaignMessageId}`;
    try {
      await this.prisma.revenueAttribution.create({
        data: {
          tenantId: input.tenantId,
          model: 'LAST_TOUCH',
          revenueEventId: input.revenueEventId,
          campaignMessageId: input.campaignMessageId,
          attributedCents: input.attributedCents,
          isDirect: true,
          dedupeKey
        }
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') {
        throw error;
      }
    }
  }
}
