export const STRIPE_SIGNATURE_HEADER = 'stripe-signature';
export const STRIPE_WEBHOOK_EVENT_NAME = 'payment_intent.succeeded';
export const SOS_CASE_ORCHESTRATION_JOB_NAME = 'sos-case-create';
export const SOS_FOLLOWUP_SWEEP_JOB_NAME = 'sos-followup-sweep';
export const SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_NAME = 'sos-followup-sweep-scheduler';
export const SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_ID = 'sos-followup-sweep-scheduler';

export const SOS_REQUIRED_PAYMENT_METADATA_KEYS = [
  'sos_tenant_id',
  'sos_consult_type',
  'sos_parent_name',
  'sos_parent_email',
  'sos_parent_phone',
  'sos_parent_address',
  'sos_baby_name',
  'sos_baby_dob'
] as const;

export type SosRequiredPaymentMetadataKey = (typeof SOS_REQUIRED_PAYMENT_METADATA_KEYS)[number];
