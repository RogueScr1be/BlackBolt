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
