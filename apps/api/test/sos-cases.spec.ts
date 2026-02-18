import { BadRequestException } from '@nestjs/common';
import { SosService } from '../src/modules/sos/sos.service';

describe('SosService cases', () => {
  it('lists cases with canonical identity summary', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-sos' })
      },
      sosCase: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'case_1',
            tenantId: 'tenant-sos',
            consultType: 'remote_video',
            status: 'PAID',
            driveFolderUrl: 'https://drive.google.com/folder/1',
            createdAt: new Date('2026-02-18T12:00:00.000Z')
          }
        ])
      },
      sosCasePayload: {
        findFirst: jest.fn().mockResolvedValue({
          canonicalJson: {
            patient: { parentName: 'Leah Whitley' },
            baby: { name: 'Baby W' }
          }
        })
      }
    };

    const service = new SosService(prisma as never, {} as never);
    const result = await service.listCases({ tenantId: 'tenant-sos' });

    expect(result.items).toEqual([
      expect.objectContaining({
        caseId: 'case_1',
        parentName: 'Leah Whitley',
        babyName: 'Baby W'
      })
    ]);
  });

  it('returns detailed case view', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-sos' })
      },
      sosCase: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'case_1',
          tenantId: 'tenant-sos',
          consultType: 'phone',
          status: 'PAID',
          driveFolderId: 'folder_1',
          driveFolderUrl: 'https://drive.google.com/folder/1',
          createdAt: new Date('2026-02-18T12:00:00.000Z')
        })
      },
      sosCasePayload: {
        findFirst: jest.fn().mockResolvedValue({
          canonicalJson: {
            patient: {
              parentName: 'Leah Whitley',
              email: 'leah@example.com',
              phone: '832-111-2222',
              address: 'Houston, TX'
            },
            baby: {
              name: 'Baby W',
              dob: '2026-01-01'
            }
          }
        })
      }
    };

    const service = new SosService(prisma as never, {} as never);
    const result = await service.getCaseDetail({ tenantId: 'tenant-sos', caseId: 'case_1' });

    expect(result).toEqual(
      expect.objectContaining({
        caseId: 'case_1',
        patient: expect.objectContaining({
          parentName: 'Leah Whitley',
          email: 'leah@example.com'
        }),
        baby: expect.objectContaining({
          name: 'Baby W',
          dob: '2026-01-01'
        }),
        actions: expect.objectContaining({
          openFolder: true,
          soapNotes: true
        })
      })
    );
  });

  it('hard-fails unknown tenant on list', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null)
      }
    };
    const service = new SosService(prisma as never, {} as never);

    await expect(service.listCases({ tenantId: 'tenant-missing' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
