export type PostmarkWebhookPayload = {
  RecordType?: string;
  MessageID?: string;
  ID?: number | string;
  ReceivedAt?: string;
  DeliveredAt?: string;
  BouncedAt?: string;
  Metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type NormalizedPostmarkEvent = {
  providerEventId: string;
  providerMessageId: string | null;
  eventType: string;
  occurredAt: Date;
  tenantId: string | null;
  payloadRedactedJson: Record<string, unknown>;
  payloadHash: string;
};
