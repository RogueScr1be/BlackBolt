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

export type PostmarkInboundAddress = {
  Email?: string;
  Name?: string;
};

export type PostmarkInboundHeader = {
  Name?: string;
  Value?: string;
};

export type PostmarkGoogleReviewAlertPayload = {
  MessageID?: string;
  MessageStream?: string;
  From?: string;
  FromFull?: PostmarkInboundAddress | string;
  To?: string;
  ToFull?: PostmarkInboundAddress | string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  ReceivedAt?: string;
  Headers?: PostmarkInboundHeader[] | Record<string, string>;
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

export type ReviewAlertParseStatus = 'parsed' | 'needs_review' | 'quarantined';

export type ReviewAlertInboundResponse = {
  accepted: boolean;
  disabled?: boolean;
  diagnostic?: boolean;
  duplicate?: boolean;
  reviewAlertEmailId?: string;
  alertId?: string;
  parsedStatus?: ReviewAlertParseStatus;
};
