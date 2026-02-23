import { OperatorTenantsService } from '../src/modules/operator-tenants/operator-tenants.service';

describe('OperatorTenantsService', () => {
  it('lists tenants with explicit select fields to avoid implicit full-row reads', async () => {
    const prisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tenant-1',
            slug: 'tenant-1',
            name: 'Tenant One'
          }
        ])
      }
    };

    const service = new OperatorTenantsService(prisma as never);
    const result = await service.listTenants('tenant-1');

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true
      }
    });
    expect(result).toEqual({
      items: [
        {
          id: 'tenant-1',
          slug: 'tenant-1',
          name: 'Tenant One',
          health_score: 100,
          action_required_count: 0
        }
      ]
    });
  });
});
