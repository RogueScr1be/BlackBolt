import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from '../src/common/guards/tenant.guard';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req
    })
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  it('allows matching tenant context', () => {
    const guard = new TenantGuard();
    const context = makeContext({
      tenantId: 'tenant-a',
      userId: 'user-1',
      params: { tenantId: 'tenant-a' }
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('returns 403 when header tenant and path tenant mismatch', () => {
    const guard = new TenantGuard();
    const context = makeContext({
      tenantId: 'tenant-a',
      userId: 'user-1',
      params: { tenantId: 'tenant-b' }
    });

    try {
      guard.canActivate(context);
      throw new Error('expected guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getStatus()).toBe(403);
    }
  });
});
