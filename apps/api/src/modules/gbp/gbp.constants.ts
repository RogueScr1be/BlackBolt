export const GBP_SOURCE = 'GBP';
export const GBP_BASE_URL = 'https://mybusiness.googleapis.com/v4';
export const GBP_INGEST_JOB_NAME = 'gbp-ingest';

export class GbpPermanentAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GbpPermanentAuthError';
  }
}
