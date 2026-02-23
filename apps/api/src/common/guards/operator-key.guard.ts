import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { RequestWithContext } from '../request-context';
import { OperatorCredentialsService } from '../../modules/operator-credentials/operator-credentials.service';

@Injectable()
export class OperatorKeyGuard implements CanActivate {
  constructor(private readonly moduleRef: ModuleRef) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const operatorCredentials = this.moduleRef.get(OperatorCredentialsService, { strict: false });
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const headerValue = req.headers['x-operator-key'];
    const operatorKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const tenantId = req.tenantId ?? (Array.isArray(req.headers['x-tenant-id']) ? req.headers['x-tenant-id'][0] : req.headers['x-tenant-id']);

    if (!operatorCredentials) {
      throw new UnauthorizedException('Operator credentials unavailable');
    }

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }

    if (!operatorKey || operatorKey.trim().length === 0) {
      throw new UnauthorizedException('Invalid operator key');
    }

    const valid = await operatorCredentials.verifyKey({
      tenantId,
      keyPlaintext: operatorKey
    });

    if (!valid) {
      throw new UnauthorizedException('Invalid operator key');
    }

    return true;
  }
}
