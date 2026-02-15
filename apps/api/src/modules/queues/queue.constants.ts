export const QUEUES = {
  CUSTOMERS_IMPORT: 'customers.import',
  SUPPRESSIONS_IMPORT: 'suppressions.import',
  GBP_INGEST: 'gbp.ingest',
  POSTMARK_WEBHOOK_RECONCILE: 'postmark.webhook.reconcile',
  POSTMARK_SEND: 'postmark.send'
} as const;

export const DLQ_SUFFIX = ':dlq';

export function toDlqQueueName(queueName: string): string {
  return `${queueName}${DLQ_SUFFIX}`;
}
