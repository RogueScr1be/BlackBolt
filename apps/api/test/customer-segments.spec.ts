import { CustomersService } from '../src/modules/customers/customers.service';

describe('CustomersService segment summary', () => {
  it('returns deterministic segment counts with zero-fill', async () => {
    const prisma = {
      customer: {
        groupBy: jest.fn().mockResolvedValue([
          { segment: 'SEGMENT_0_90', _count: { _all: 3 } },
          { segment: 'SEGMENT_365_PLUS', _count: { _all: 2 } }
        ])
      }
    };

    const service = new CustomersService(prisma as never);
    const result = await service.getSegmentSummary('tenant-1');

    expect(result.total).toBe(5);
    expect(result.items).toEqual([
      { segment: '0_90', count: 3 },
      { segment: '90_365', count: 0 },
      { segment: '365_plus', count: 2 }
    ]);
  });
});
