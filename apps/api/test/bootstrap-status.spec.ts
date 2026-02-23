import { BootstrapService } from '../src/modules/bootstrap/bootstrap.service';

describe('BootstrapService', () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('returns overall_ready=true when required checks pass', async () => {
    process.env.POSTMARK_WEBHOOK_SECRET = 'secret';
    process.env.POSTMARK_WEBHOOK_BASIC_AUTH_CURRENT = 'user:pass';
    process.env.POSTMARK_SEND_DISABLED = '1';
    delete process.env.GBP_POLL_SCHEDULER_DISABLED;

    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          gbpIntegrationStatus: 'CONNECTED',
          gbpAccountId: 'acct',
          gbpLocationId: 'loc',
          gbpAccessTokenRef: 'token-ref'
        })
      },
      operatorCredential: {
        findUnique: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          rotatedAt: new Date()
        })
      }
    };

    const service = new BootstrapService(prisma as never);
    const result = await service.getStatus('tenant-1');
    expect(result.overall_ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.checks.send_mode.mode).toBe('shadow');
  });

  it('reports missing checks when configuration is incomplete', async () => {
    process.env.POSTMARK_WEBHOOK_SECRET = '';
    process.env.POSTMARK_WEBHOOK_BASIC_AUTH_CURRENT = '';
    process.env.GBP_POLL_SCHEDULER_DISABLED = '1';

    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          gbpIntegrationStatus: 'DISCONNECTED',
          gbpAccountId: null,
          gbpLocationId: null,
          gbpAccessTokenRef: null
        })
      },
      operatorCredential: {
        findUnique: jest.fn().mockResolvedValue(null)
      }
    };

    const service = new BootstrapService(prisma as never);
    const result = await service.getStatus('tenant-1');
    expect(result.overall_ready).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining(['operator_auth', 'gbp_integration', 'postmark_webhook', 'review_scheduler'])
    );
  });
});
