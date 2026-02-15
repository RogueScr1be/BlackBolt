export const POSTMARK_PROVIDER = 'POSTMARK';
export const POSTMARK_SIGNATURE_HEADER = 'x-postmark-signature';
export const AUTHORIZATION_HEADER = 'authorization';
export const POSTMARK_WEBHOOK_JOB_NAME = 'postmark-webhook-reconcile';
export const POSTMARK_STALE_SEND_CLAIM_MINUTES = 15;

export const POSTMARK_INVARIANT_CODES = [
  'POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID',
  'POSTMARK_SEND_STUCK_SENDING_WITHOUT_PROVIDER_ID'
] as const;

export type PostmarkInvariantCode = (typeof POSTMARK_INVARIANT_CODES)[number];

export const POSTMARK_INVARIANT_UNKNOWN_CODE = 'POSTMARK_INVARIANT_UNKNOWN' as const;
export type PostmarkInvariantCodeOrUnknown = PostmarkInvariantCode | typeof POSTMARK_INVARIANT_UNKNOWN_CODE;

export const POSTMARK_INVARIANT_BREACH_RANK: Record<PostmarkInvariantCodeOrUnknown, number> = {
  POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID: 100,
  POSTMARK_SEND_STUCK_SENDING_WITHOUT_PROVIDER_ID: 80,
  POSTMARK_INVARIANT_UNKNOWN: 1
};

export function parsePostmarkInvariantCode(code: string): PostmarkInvariantCodeOrUnknown {
  return (POSTMARK_INVARIANT_CODES as readonly string[]).includes(code)
    ? (code as PostmarkInvariantCode)
    : POSTMARK_INVARIANT_UNKNOWN_CODE;
}

export function rankPostmarkInvariantBreach(code: PostmarkInvariantCodeOrUnknown): number {
  return POSTMARK_INVARIANT_BREACH_RANK[code] ?? 0;
}

export const DELIVERY_EVENT_TO_STATE: Record<string, 'SENT' | 'DELIVERED' | 'BOUNCED' | 'SPAMCOMPLAINT' | 'UNSUBSCRIBED'> =
  {
    sent: 'SENT',
    delivery: 'DELIVERED',
    delivered: 'DELIVERED',
    bounce: 'BOUNCED',
    bounced: 'BOUNCED',
    spamcomplaint: 'SPAMCOMPLAINT',
    unsubscribe: 'UNSUBSCRIBED',
    unsubscribed: 'UNSUBSCRIBED'
  };

export const DELIVERY_STATE_RANK: Record<'QUEUED' | 'SENT' | 'DELIVERED' | 'BOUNCED' | 'SPAMCOMPLAINT' | 'UNSUBSCRIBED', number> = {
  QUEUED: 0,
  SENT: 10,
  DELIVERED: 20,
  BOUNCED: 90,
  SPAMCOMPLAINT: 90,
  UNSUBSCRIBED: 90
};
