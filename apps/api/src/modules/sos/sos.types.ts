export type StripePaymentIntent = {
  id: string;
  client_secret?: string | null;
  amount?: number;
  currency?: string;
  status?: string;
  metadata?: Record<string, string | undefined> | null;
};

export type StripeEventPayload = {
  id: string;
  type: string;
  data?: {
    object?: unknown;
  };
};

export type SosCanonicalPayload = {
  case: {
    consultType: string;
    payment: {
      stripePaymentIntentId: string;
      depositStatus: 'paid';
    };
  };
  patient: {
    parentName: string;
    email: string;
    phone: string;
    address: string;
  };
  baby: {
    name: string;
    dob: string;
  };
};

export type SosCreatePaymentIntentRequest = {
  tenantId: string;
  consultType: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  parentAddress: string;
  babyName: string;
  babyDob: string;
  amountCents: number;
  currency?: string;
  idempotencyKey?: string;
};

export type SosCreatePaymentIntentResponse = {
  accepted: true;
  paymentIntentId: string;
  clientSecret: string | null;
  status: string | null;
  amount: number;
  currency: string;
  idempotencyKey: string;
};

export type SosCaseListItem = {
  caseId: string;
  tenantId: string;
  consultType: string;
  status: string;
  createdAt: string;
  parentName: string | null;
  babyName: string | null;
  driveFolderUrl: string | null;
};

export type SosCaseDetail = {
  caseId: string;
  tenantId: string;
  consultType: string;
  status: string;
  createdAt: string;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  patient: {
    parentName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  baby: {
    name: string | null;
    dob: string | null;
  };
  actions: {
    openFolder: boolean;
    soapNotes: boolean;
    generatePediIntake: boolean;
    sendFollowUp: boolean;
    sendProviderFax: boolean;
  };
};

export type SosSoapInput = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export type SosSaveSoapResponse = {
  caseId: string;
  payloadVersion: number;
  soapSaved: true;
};

export type SosGeneratePediIntakeResponse = {
  caseId: string;
  artifactType: 'pedi_intake_pdf';
  generatedAt: string;
};

export type SosSendActionResponse = {
  caseId: string;
  artifactType: 'follow_up_letter_pdf' | 'provider_fax_packet_pdf';
  sentAt: string;
  provider: 'postmark' | 'srfax';
  sendStatus: 'sent';
  providerMessageId?: string | null;
  providerTransmissionId?: string | null;
  simulated: false;
};

export type SosFollowupSweepResponse = {
  tenantId: string;
  windowStartDays: number;
  windowEndDays: number;
  dueCount: number;
  queuedCount: number;
  skippedCount: number;
  runAt: string;
};

export type SosEmailSendResult = {
  provider: 'postmark';
  providerMessageId: string;
  sentAt: string;
};

export type SosFaxSendResult = {
  provider: 'srfax';
  providerTransmissionId: string;
  status: string;
  sentAt: string;
};

export type SosFollowupSweepJobPayload = {
  tenantId: string;
  windowStartDays: number;
  windowEndDays: number;
  triggeredBy: 'scheduler' | 'manual';
  idempotencyKey: string;
};
