import { RevenueEventKind, RevenueEventSource } from '@prisma/client';

export type CreateRevenueEventInput = {
  tenantId: string;
  idempotencyKey: string;
  occurredAt: string;
  amountCents: number;
  currency: string;
  kind: RevenueEventKind;
  source: RevenueEventSource;
  externalId?: string;
  customerId?: string;
  campaignMessageId?: string;
  linkCode?: string;
  providerMessageId?: string;
  description?: string;
  redactedMetadata?: Record<string, string>;
};

export type RevenueSummaryInput = {
  tenantId: string;
  from?: string;
  to?: string;
};
