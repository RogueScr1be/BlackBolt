import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { RequestWithContext } from '../request-context';
import { OperatorCredentialsService } from '../../modules/operator-credentials/operator-credentials.service';

@Injectable()
export class PortfolioOperatorGuard implements CanActivate {
  constructor(private readonly operatorCredentials: OperatorCredentialsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const headerValue = req.headers['x-operator-key'];
    const operatorKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!operatorKey || operatorKey.trim().length === 0) {
      throw new UnauthorizedException('Invalid operator key');
    }

    const portfolio = await this.operatorCredentials.verifyPortfolioKey({ keyPlaintext: operatorKey });
    if (portfolio) {
      req.operatorScope = 'portfolio';
      req.operatorPortfolioCredentialId = portfolio.credentialId;
      req.operatorTenantIds = portfolio.tenantIds;
      return true;
    }

    const tenantHeaderRaw = req.headers['x-tenant-id'];
    const tenantHeader = Array.isArray(tenantHeaderRaw) ? tenantHeaderRaw[0] : tenantHeaderRaw;
    if (!tenantHeader) {
      throw new UnauthorizedException('Invalid operator key');
    }

    const tenantScopedValid = await this.operatorCredentials.verifyKey({
      tenantId: tenantHeader,
      keyPlaintext: operatorKey
    });
    if (!tenantScopedValid) {
      throw new UnauthorizedException('Invalid operator key');
    }

    req.operatorScope = 'tenant';
    req.tenantId = req.tenantId ?? tenantHeader;
    req.operatorTenantIds = [tenantHeader];
    return true;
  }
}
