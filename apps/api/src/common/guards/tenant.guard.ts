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
    const headers = req.headers ?? {};
    const tenantHeader = headers['x-tenant-id'];
    const userHeader = headers['x-user-id'];

    if (!req.tenantId) {
      req.tenantId = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
    }
    if (!req.userId) {
      req.userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;
    }

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
