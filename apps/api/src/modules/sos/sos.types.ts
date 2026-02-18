export type StripePaymentIntent = {
  id: string;
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
