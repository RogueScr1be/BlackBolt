import { UnauthorizedException } from '@nestjs/common';
import { OperatorKeyGuard } from '../src/common/guards/operator-key.guard';

describe('OperatorKeyGuard', () => {
  it('accepts valid tenant-scoped key', async () => {
    const guard = new OperatorKeyGuard({
      get: jest.fn().mockReturnValue({ verifyKey: jest.fn().mockResolvedValue(true) })
    } as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          tenantId: 'tenant-1',
          headers: {
            'x-tenant-id': 'tenant-1',
            'x-operator-key': 'valid-key'
          }
        })
      })
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('rejects invalid key', async () => {
    const guard = new OperatorKeyGuard({
      get: jest.fn().mockReturnValue({ verifyKey: jest.fn().mockResolvedValue(false) })
    } as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          tenantId: 'tenant-1',
          headers: {
            'x-tenant-id': 'tenant-1',
            'x-operator-key': 'invalid-key'
          }
        })
      })
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when operator credential service is unavailable', async () => {
    const guard = new OperatorKeyGuard({ get: jest.fn().mockReturnValue(undefined) } as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          tenantId: 'tenant-1',
          headers: {
            'x-tenant-id': 'tenant-1',
            'x-operator-key': 'invalid-key'
          }
        })
      })
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
