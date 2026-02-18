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

  it('saves SOAP into new payload version and creates soap artifact', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-sos' })
      },
      sosCase: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'case_1',
          tenantId: 'tenant-sos'
        }),
        update: jest.fn().mockResolvedValue({})
      },
      sosCasePayload: {
        findFirst: jest.fn().mockResolvedValue({
          version: 1,
          canonicalJson: { patient: { parentName: 'Leah' } }
        }),
        create: jest.fn().mockResolvedValue({
          version: 2
        })
      },
      sosArtifact: {
        upsert: jest.fn().mockResolvedValue({})
      }
    };

    const service = new SosService(prisma as never, {} as never);
    const result = await service.saveSoap({
      tenantId: 'tenant-sos',
      caseId: 'case_1',
      soap: {
        subjective: 's',
        objective: 'o',
        assessment: 'a',
        plan: 'p'
      }
    });

    expect(result).toEqual({
      caseId: 'case_1',
      payloadVersion: 2,
      soapSaved: true
    });
    expect(prisma.sosArtifact.upsert).toHaveBeenCalled();
  });

  it('generates pedi artifact record from latest payload', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-sos' })
      },
      sosCase: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'case_1',
          tenantId: 'tenant-sos'
        })
      },
      sosCasePayload: {
        findFirst: jest.fn().mockResolvedValue({
          version: 3,
          canonicalJson: { patient: { parentName: 'Leah' } }
        })
      },
      sosArtifact: {
        upsert: jest.fn().mockResolvedValue({})
      }
    };
    const service = new SosService(prisma as never, {} as never);

    const result = await service.generatePediIntake({
      tenantId: 'tenant-sos',
      caseId: 'case_1'
    });

    expect(result.caseId).toBe('case_1');
    expect(result.artifactType).toBe('pedi_intake_pdf');
    expect(prisma.sosArtifact.upsert).toHaveBeenCalled();
  });
});
