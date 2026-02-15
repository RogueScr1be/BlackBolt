import type { Request } from 'express';

export type RequestWithContext = Request & {
  tenantId?: string;
  userId?: string;
  rawBody?: Buffer;
};
