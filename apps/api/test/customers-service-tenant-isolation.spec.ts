import { NotFoundException } from '@nestjs/common';
import { CustomersService } from '../src/modules/customers/customers.service';

describe('CustomersService tenant isolation', () => {
  it('cannot read import status across tenants', async () => {
    const prisma = {
      customerImport: {
        findFirst: jest.fn().mockResolvedValue(null)
      }
    };

    const service = new CustomersService(prisma as never);

    await expect(service.getCustomerImportStatus('tenant-a', 'imp-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
