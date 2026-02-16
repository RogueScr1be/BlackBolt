import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from '../src/common/guards/tenant.guard';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req })
  } as unknown as ExecutionContext;
}

describe('Phase 1 tenant scoping', () => {
  it('rejects header/path tenant mismatch for /tenants/:tenantId routes', () => {
    const guard = new TenantGuard();

    expect(() =>
      guard.canActivate(
        makeContext({
          tenantId: 'tenant-a',
          params: { tenantId: 'tenant-b' }
        })
      )
    ).toThrow(ForbiddenException);
  });
});
