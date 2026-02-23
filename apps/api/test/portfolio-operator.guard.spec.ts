import { UnauthorizedException } from '@nestjs/common';
import { PortfolioOperatorGuard } from '../src/common/guards/portfolio-operator.guard';

describe('PortfolioOperatorGuard', () => {
  it('accepts valid portfolio key and sets tenant scope', async () => {
    const guard = new PortfolioOperatorGuard(
      {
        verifyPortfolioKey: jest.fn().mockResolvedValue({
          credentialId: 'cred-1',
          tenantIds: ['tenant-1', 'tenant-2']
        }),
        verifyKey: jest.fn()
      } as never
    );
    const request = {
      headers: {
        'x-operator-key': 'portfolio-key'
      }
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request
      })
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request).toMatchObject({
      operatorScope: 'portfolio',
      operatorPortfolioCredentialId: 'cred-1',
      operatorTenantIds: ['tenant-1', 'tenant-2']
    });
  });

  it('falls back to tenant-scoped key when tenant header is present', async () => {
    const guard = new PortfolioOperatorGuard(
      {
        verifyPortfolioKey: jest.fn().mockResolvedValue(null),
        verifyKey: jest.fn().mockResolvedValue(true)
      } as never
    );
    const request = {
      headers: {
        'x-operator-key': 'tenant-key',
        'x-tenant-id': 'tenant-1'
      }
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request
      })
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request).toMatchObject({
      operatorScope: 'tenant',
      operatorTenantIds: ['tenant-1']
    });
  });

  it('rejects invalid key without fallback tenant scope', async () => {
    const guard = new PortfolioOperatorGuard(
      {
        verifyPortfolioKey: jest.fn().mockResolvedValue(null),
        verifyKey: jest.fn().mockResolvedValue(false)
      } as never
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-operator-key': 'invalid'
          }
        })
      })
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
