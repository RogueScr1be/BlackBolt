import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { RequestWithContext } from '../request-context';

@Injectable()
export class OperatorKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const headerValue = req.headers['x-operator-key'];
    const operatorKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const expected = process.env.OPERATOR_KEY;

    if (!expected || expected.trim().length === 0) {
      throw new ServiceUnavailableException('Operator key is not configured');
    }

    if (!operatorKey || operatorKey !== expected) {
      throw new UnauthorizedException('Invalid operator key');
    }

    return true;
  }
}
