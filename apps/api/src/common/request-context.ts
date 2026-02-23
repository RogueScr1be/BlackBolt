import type { Request } from 'express';

export type RequestWithContext = Request & {
  tenantId?: string;
  userId?: string;
  operatorScope?: 'tenant' | 'portfolio';
  operatorPortfolioCredentialId?: string;
  operatorTenantIds?: string[];
  rawBody?: Buffer;
};
