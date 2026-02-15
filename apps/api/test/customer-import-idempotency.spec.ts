import { CustomersImportProcessor } from '../src/modules/customers/customers-import.processor';

describe('customer import idempotency', () => {
  it('does not upsert twice when import already succeeded', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);

    let importStatus: 'QUEUED' | 'SUCCEEDED' = 'QUEUED';

    const prisma = {
      customerImport: {
        findFirst: jest.fn().mockImplementation(async () => ({
          id: 'imp-1',
          tenantId: 'tenant-1',
          status: importStatus,
          totalRows: 1,
          processedRows: 0,
          succeededRows: 0,
          failedRows: 0,
          duplicateRows: 0,
          errorJson: null,
          createdAt: new Date(),
          finishedAt: null
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { status?: 'SUCCEEDED' | 'RUNNING' } }) => {
          if (data.status === 'SUCCEEDED') {
            importStatus = 'SUCCEEDED';
          }
          return {};
        })
      },
      customerImportRow: {
        findMany: jest.fn().mockResolvedValue([
          {
            rowNum: 2,
            errorCode: null,
            errorMessage: null,
            normalizedJson: {
              email: 'a@example.com',
              displayName: 'A',
              externalCustomerRef: null,
              lastServiceDate: null,
              segment: '365_plus'
            }
          }
        ]),
        update: jest.fn().mockResolvedValue({})
      },
      customer: {
        upsert
      }
    };

    const ledger = {
      createRun: jest.fn().mockResolvedValue({ run: { id: 'run-1' }, created: true }),
      markState: jest.fn().mockResolvedValue({})
    };

    const processor = new CustomersImportProcessor(prisma as never, ledger as never);

    const job = {
      id: 'imp-1',
      name: 'customer-import',
      data: { tenantId: 'tenant-1', importId: 'imp-1' }
    };

    await processor.process(job as never);
    await processor.process(job as never);

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('dedupes duplicate rows within the same file', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);

    const prisma = {
      customerImport: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'imp-1',
          tenantId: 'tenant-1',
          status: 'QUEUED',
          totalRows: 2,
          processedRows: 0,
          succeededRows: 0,
          failedRows: 0,
          duplicateRows: 0,
          errorJson: null,
          createdAt: new Date(),
          finishedAt: null
        }),
        update: jest.fn().mockResolvedValue({})
      },
      customerImportRow: {
        findMany: jest.fn().mockResolvedValue([
          {
            rowNum: 2,
            errorCode: null,
            errorMessage: null,
            normalizedJson: {
              email: 'a@example.com',
              displayName: 'A',
              externalCustomerRef: null,
              lastServiceDate: null,
              segment: '365_plus'
            }
          },
          {
            rowNum: 3,
            errorCode: null,
            errorMessage: null,
            normalizedJson: {
              email: 'a@example.com',
              displayName: 'A2',
              externalCustomerRef: null,
              lastServiceDate: null,
              segment: '365_plus'
            }
          }
        ]),
        update: jest.fn().mockResolvedValue({})
      },
      customer: {
        upsert
      }
    };

    const ledger = {
      createRun: jest.fn().mockResolvedValue({ run: { id: 'run-1' }, created: true }),
      markState: jest.fn().mockResolvedValue({})
    };

    const processor = new CustomersImportProcessor(prisma as never, ledger as never);
    const job = {
      id: 'imp-1',
      name: 'customer-import',
      data: { tenantId: 'tenant-1', importId: 'imp-1' }
    };

    await processor.process(job as never);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(prisma.customerImportRow.update).toHaveBeenCalledTimes(1);
  });
});
