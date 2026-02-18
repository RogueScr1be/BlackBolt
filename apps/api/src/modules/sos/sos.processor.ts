import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobRunLedgerService } from '../queues/job-run-ledger.service';
import { QUEUES } from '../queues/queue.constants';
import type { SosCaseCreateJobPayload } from './sos.queue';
import { SOS_CASE_ORCHESTRATION_JOB_NAME } from './sos.constants';
import { SosDriveClient } from './drive/drive.client';

function formatDateForFolder(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sanitizePart(input: string): string {
  return input
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function splitName(parentName: string): { first: string; last: string } {
  const parts = parentName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first: 'Unknown', last: 'Patient' };
  }
  if (parts.length === 1) {
    return { first: parts[0], last: 'Patient' };
  }
  return {
    first: parts[0],
    last: parts[parts.length - 1]
  };
}

@Processor(QUEUES.SOS_CASE_ORCHESTRATION)
export class SosProcessor extends WorkerHost {
  private readonly logger = new Logger(SosProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: JobRunLedgerService,
    private readonly driveClient: SosDriveClient
  ) {
    super();
  }

  async process(job: Job<SosCaseCreateJobPayload>): Promise<void> {
    if (job.name !== SOS_CASE_ORCHESTRATION_JOB_NAME) {
      this.logger.warn(`Unknown SOS job name ${job.name}`);
      return;
    }

    const run = await this.ledger.createRun({
      tenantId: job.data.tenantId,
      queueName: QUEUES.SOS_CASE_ORCHESTRATION,
      jobName: job.name,
      jobId: String(job.id ?? job.data.idempotencyKey),
      idempotencyKey: job.data.idempotencyKey
    });

    const runId = run.run.id;
    if (!run.created) {
      const existing = await this.prisma.jobRun.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: job.data.tenantId,
            idempotencyKey: job.data.idempotencyKey
          }
        },
        select: {
          state: true
        }
      });

      if (existing?.state === 'succeeded') {
        return;
      }
    }

    try {
      const webhookEvent = await this.prisma.sosStripeWebhookEvent.findUnique({
        where: {
          id: job.data.webhookEventId
        }
      });

      if (!webhookEvent) {
        await this.ledger.markState(runId, 'failed', 'SOS_WEBHOOK_EVENT_NOT_FOUND', 'Webhook event not found');
        return;
      }

      const payload = webhookEvent.payloadRedactedJson as {
        canonical?: {
          case?: { consultType?: string; payment?: { stripePaymentIntentId?: string } };
          patient?: { parentName?: string };
        };
      };

      const canonical = payload.canonical;
      if (!canonical?.case?.consultType || !canonical.case.payment?.stripePaymentIntentId || !canonical.patient?.parentName) {
        await this.prisma.sosStripeWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            processStatus: 'FAILED',
            lastError: 'Canonical payload missing required fields'
          }
        });
        await this.ledger.markState(runId, 'failed', 'SOS_CANONICAL_INVALID', 'Canonical payload missing required fields');
        return;
      }

      const sosCase = await this.prisma.sosCase.upsert({
        where: {
          tenantId_stripePaymentIntentId: {
            tenantId: job.data.tenantId,
            stripePaymentIntentId: canonical.case.payment.stripePaymentIntentId
          }
        },
        update: {
          consultType: canonical.case.consultType,
          status: 'PAID'
        },
        create: {
          tenantId: job.data.tenantId,
          consultType: canonical.case.consultType,
          status: 'PAID',
          stripePaymentIntentId: canonical.case.payment.stripePaymentIntentId
        }
      });

      const latestPayload = await this.prisma.sosCasePayload.findFirst({
        where: { caseId: sosCase.id },
        orderBy: { version: 'desc' }
      });

      const canonicalJson = canonical as Prisma.InputJsonValue;
      const canonicalRaw = JSON.stringify(canonical);
      const latestRaw = latestPayload ? JSON.stringify(latestPayload.canonicalJson) : null;

      if (!latestPayload || latestRaw !== canonicalRaw) {
        await this.prisma.sosCasePayload.create({
          data: {
            caseId: sosCase.id,
            version: (latestPayload?.version ?? 0) + 1,
            canonicalJson
          }
        });
      }

      const existingArtifact = await this.prisma.sosArtifact.findUnique({
        where: {
          caseId_artifactType: {
            caseId: sosCase.id,
            artifactType: 'drive_folder'
          }
        }
      });

      if (!existingArtifact) {
        const nameParts = splitName(canonical.patient.parentName);
        const folderName = `${sanitizePart(nameParts.last)}_${sanitizePart(nameParts.first)}_${formatDateForFolder(new Date())}`;
        const driveFolder = await this.driveClient.createFolder({ name: folderName });

        await this.prisma.sosArtifact.create({
          data: {
            tenantId: job.data.tenantId,
            caseId: sosCase.id,
            artifactType: 'drive_folder',
            fileName: folderName,
            driveFileId: driveFolder.id,
            url: driveFolder.webViewLink,
            metadataJson: {
              webhookEventId: webhookEvent.id,
              rootFolderId: process.env.SOS_DRIVE_ROOT_FOLDER_ID ?? null
            } as Prisma.InputJsonValue
          }
        });

        await this.prisma.sosCase.update({
          where: { id: sosCase.id },
          data: {
            driveFolderId: driveFolder.id,
            driveFolderUrl: driveFolder.webViewLink
          }
        });
      }

      await this.prisma.sosStripeWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processStatus: 'SUCCEEDED',
          lastError: null
        }
      });

      await this.ledger.markState(runId, 'succeeded', undefined, undefined, {
        webhook_event_id: webhookEvent.id,
        case_id: sosCase.id,
        payment_intent_id: canonical.case.payment.stripePaymentIntentId,
        artifact_type: 'drive_folder'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SOS processor error';

      await this.prisma.sosStripeWebhookEvent.updateMany({
        where: { id: job.data.webhookEventId },
        data: {
          processStatus: 'FAILED',
          lastError: message
        }
      });

      await this.ledger.markState(runId, 'failed', 'SOS_CASE_ORCHESTRATION_FAILED', message);
      throw error;
    }
  }
}
