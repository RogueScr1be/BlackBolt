import { IntegrationsService } from '../src/modules/integrations/integrations.service';

describe('IntegrationsService audit logging', () => {
  it('writes an audit log with before/after diff when GBP integration is patched', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          gbpAccountId: 'acct-old',
          gbpLocationId: 'loc-old',
          gbpAccessTokenRef: 'tok-old',
          gbpIntegrationStatus: 'DISCONNECTED'
        }),
        update: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          gbpAccountId: 'acct-new',
          gbpLocationId: 'loc-new',
          gbpAccessTokenRef: 'tok-new',
          gbpIntegrationStatus: 'CONNECTED'
        })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };

    const service = new IntegrationsService(prisma as never);

    await service.setGbpIntegration({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      gbpAccountId: 'acct-new',
      gbpLocationId: 'loc-new',
      gbpAccessTokenRef: 'tok-new',
      reason: 'operator_patch'
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          actorUserId: 'user-1',
          action: 'GBP_INTEGRATION_UPDATED',
          metadataJson: expect.objectContaining({
            reason: 'operator_patch',
            before: expect.objectContaining({
              gbpAccountId: 'acct-old'
            }),
            after: expect.objectContaining({
              gbpAccountId: 'acct-new'
            })
          })
        })
      })
    );
  });
});
