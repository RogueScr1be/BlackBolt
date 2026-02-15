import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import type { RequestWithContext } from '../request-context';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithContext>();

    if (!req.tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }

    const routeTenantId = typeof req.params?.tenantId === 'string' ? req.params.tenantId : undefined;
    if (routeTenantId && routeTenantId !== req.tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    return true;
  }
}
