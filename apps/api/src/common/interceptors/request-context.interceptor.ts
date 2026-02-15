import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { RequestWithContext } from '../request-context';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const tenantHeader = req.headers['x-tenant-id'];
    const userHeader = req.headers['x-user-id'];

    req.tenantId = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
    req.userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;

    return next.handle();
  }
}
