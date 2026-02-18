import { QUEUES } from '../src/modules/queues/queue.constants';
import { SOS_CASE_ORCHESTRATION_JOB_NAME } from '../src/modules/sos/sos.constants';
import { SosProcessor } from '../src/modules/sos/sos.processor';

describe('SosProcessor', () => {
  it('creates case, payload and drive artifact on first run', async () => {
    const prisma = {
      jobRun: {
        findUnique: jest.fn()
      },
      sosStripeWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'swe_1',
          payloadRedactedJson: {
            canonical: {
              case: { consultType: 'in_home', payment: { stripePaymentIntentId: 'pi_1' } },
              patient: { parentName: 'Leah Whitley' }
            }
          }
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      sosCase: {
        upsert: jest.fn().mockResolvedValue({ id: 'case_1' }),
        update: jest.fn().mockResolvedValue({})
      },
      sosCasePayload: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'payload_1' })
      },
      sosArtifact: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'artifact_1' })
      }
    };

    const ledger = {
      createRun: jest.fn().mockResolvedValue({ run: { id: 'run_1' }, created: true }),
      markState: jest.fn().mockResolvedValue({})
    };

    const driveClient = {
      createFolder: jest.fn().mockResolvedValue({ id: 'drive_folder_1', webViewLink: 'https://drive.google.com/drive/folders/drive_folder_1' })
    };

    const processor = new SosProcessor(prisma as never, ledger as never, driveClient as never);

    await processor.process({
      id: 'job_1',
      name: SOS_CASE_ORCHESTRATION_JOB_NAME,
      data: {
        tenantId: 'tenant-sos',
        paymentIntentId: 'pi_1',
        webhookEventId: 'swe_1',
        idempotencyKey: 'sos-case:create:tenant-sos:pi_1'
      }
    } as never);

    expect(prisma.sosCase.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.sosCasePayload.create).toHaveBeenCalledTimes(1);
    expect(driveClient.createFolder).toHaveBeenCalledTimes(1);
    expect(prisma.sosArtifact.create).toHaveBeenCalledTimes(1);
    expect(ledger.markState).toHaveBeenCalledWith(
      'run_1',
      'succeeded',
      undefined,
      undefined,
      expect.objectContaining({
        case_id: 'case_1',
        payment_intent_id: 'pi_1'
      })
    );
  });

  it('skips duplicate succeeded run idempotently', async () => {
    const prisma = {
      jobRun: {
        findUnique: jest.fn().mockResolvedValue({ state: 'succeeded' })
      },
      sosStripeWebhookEvent: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn()
      },
      sosCase: {
        upsert: jest.fn(),
        update: jest.fn()
      },
      sosCasePayload: {
        findFirst: jest.fn(),
        create: jest.fn()
      },
      sosArtifact: {
        findUnique: jest.fn(),
        create: jest.fn()
      }
    };

    const ledger = {
      createRun: jest.fn().mockResolvedValue({ run: { id: 'run_existing' }, created: false }),
      markState: jest.fn()
    };

    const driveClient = {
      createFolder: jest.fn()
    };

    const processor = new SosProcessor(prisma as never, ledger as never, driveClient as never);

    await processor.process({
      id: 'job_1',
      name: SOS_CASE_ORCHESTRATION_JOB_NAME,
      data: {
        tenantId: 'tenant-sos',
        paymentIntentId: 'pi_1',
        webhookEventId: 'swe_1',
        idempotencyKey: 'sos-case:create:tenant-sos:pi_1'
      }
    } as never);

    expect(prisma.sosCase.upsert).not.toHaveBeenCalled();
    expect(driveClient.createFolder).not.toHaveBeenCalled();
    expect(ledger.markState).not.toHaveBeenCalled();
  });

  it('marks run failed when drive folder creation errors', async () => {
    const prisma = {
      jobRun: {
        findUnique: jest.fn()
      },
      sosStripeWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'swe_2',
          payloadRedactedJson: {
            canonical: {
              case: { consultType: 'phone', payment: { stripePaymentIntentId: 'pi_2' } },
              patient: { parentName: 'Leah Whitley' }
            }
          }
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      sosCase: {
        upsert: jest.fn().mockResolvedValue({ id: 'case_2' }),
        update: jest.fn().mockResolvedValue({})
      },
      sosCasePayload: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'payload_2' })
      },
      sosArtifact: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'artifact_2' })
      }
    };

    const ledger = {
      createRun: jest.fn().mockResolvedValue({ run: { id: 'run_2' }, created: true }),
      markState: jest.fn().mockResolvedValue({})
    };

    const driveClient = {
      createFolder: jest.fn().mockRejectedValue(new Error('Drive unavailable'))
    };

    const processor = new SosProcessor(prisma as never, ledger as never, driveClient as never);

    await expect(
      processor.process({
        id: 'job_2',
        name: SOS_CASE_ORCHESTRATION_JOB_NAME,
        data: {
          tenantId: 'tenant-sos',
          paymentIntentId: 'pi_2',
          webhookEventId: 'swe_2',
          idempotencyKey: 'sos-case:create:tenant-sos:pi_2'
        }
      } as never)
    ).rejects.toThrow('Drive unavailable');

    expect(prisma.sosStripeWebhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'swe_2' },
        data: expect.objectContaining({
          processStatus: 'FAILED'
        })
      })
    );
    expect(ledger.markState).toHaveBeenCalledWith('run_2', 'failed', 'SOS_CASE_ORCHESTRATION_FAILED', 'Drive unavailable');
  });

  it('ignores unknown job names', async () => {
    const prisma = {};
    const ledger = { createRun: jest.fn(), markState: jest.fn() };
    const driveClient = { createFolder: jest.fn() };
    const processor = new SosProcessor(prisma as never, ledger as never, driveClient as never);

    await processor.process({
      id: 'job_3',
      name: `${QUEUES.SOS_CASE_ORCHESTRATION}:unknown`,
      data: {
        tenantId: 'tenant-sos',
        paymentIntentId: 'pi_3',
        webhookEventId: 'swe_3',
        idempotencyKey: 'sos-case:create:tenant-sos:pi_3'
      }
    } as never);

    expect(ledger.createRun).not.toHaveBeenCalled();
  });
});
