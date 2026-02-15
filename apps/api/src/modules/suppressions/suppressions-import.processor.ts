import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { JobRunLedgerService } from '../queues/job-run-ledger.service';
import { QUEUES } from '../queues/queue.constants';
import { SUPPRESSION_IMPORT_IDEMPOTENCY_PREFIX } from './suppressions.constants';
import type { SuppressionImportJobPayload } from './suppressions-import.queue';

@Processor(QUEUES.SUPPRESSIONS_IMPORT)
export class SuppressionsImportProcessor extends WorkerHost {
  private readonly logger = new Logger(SuppressionsImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: JobRunLedgerService
  ) {
    super();
  }

  async process(job: Job<SuppressionImportJobPayload>): Promise<void> {
    const { tenantId, suppressionImportId } = job.data;
    const idempotencyKey = `${SUPPRESSION_IMPORT_IDEMPOTENCY_PREFIX}:${tenantId}:${suppressionImportId}`;

    const importRecord = await this.prisma.suppressionImport.findFirst({
      where: { id: suppressionImportId, tenantId }
    });

    if (!importRecord) {
      this.logger.warn(`Suppression import ${suppressionImportId} not found for tenant ${tenantId}`);
      return;
    }

    if (importRecord.status === 'SUCCEEDED') {
      return;
    }

    const run = await this.ledger.createRun({
      tenantId,
      queueName: QUEUES.SUPPRESSIONS_IMPORT,
      jobName: job.name,
      jobId: String(job.id ?? suppressionImportId),
      idempotencyKey
    });

    await this.prisma.suppressionImport.update({
      where: { id: suppressionImportId },
      data: { status: 'RUNNING' }
    });

    try {
      const rows = await this.prisma.suppressionImportRow.findMany({
        where: { tenantId, importId: suppressionImportId },
        orderBy: { rowNum: 'asc' }
      });

      let processedRows = 0;
      let succeededRows = 0;
      let failedRows = 0;
      let duplicateRows = 0;
      const dedupe = new Set<string>();
      const errors: Array<{ rowNum: number; code: string; message: string }> = [];

      for (const row of rows) {
        processedRows += 1;

        if (row.errorCode || !row.normalizedJson || typeof row.normalizedJson !== 'object') {
          failedRows += 1;
          if (row.errorCode && row.errorMessage) {
            errors.push({ rowNum: row.rowNum, code: row.errorCode, message: row.errorMessage });
          }
          continue;
        }

        const normalized = row.normalizedJson as {
          email: string;
          channel: string;
          reason: string | null;
        };

        const dedupeKey = `${normalized.email}:${normalized.channel}`;
        if (dedupe.has(dedupeKey)) {
          duplicateRows += 1;
          failedRows += 1;

          await this.prisma.suppressionImportRow.update({
            where: {
              tenantId_importId_rowNum: {
                tenantId,
                importId: suppressionImportId,
                rowNum: row.rowNum
              }
            },
            data: {
              errorCode: 'DUPLICATE_IN_FILE',
              errorMessage: 'Duplicate suppression row within import file'
            }
          });

          errors.push({
            rowNum: row.rowNum,
            code: 'DUPLICATE_IN_FILE',
            message: 'Duplicate suppression row within import file'
          });
          continue;
        }

        dedupe.add(dedupeKey);

        try {
          const customer = await this.prisma.customer.findFirst({
            where: { tenantId, email: normalized.email },
            select: { id: true }
          });

          await this.prisma.suppressionEntry.upsert({
            where: {
              tenantId_email_channel: {
                tenantId,
                email: normalized.email,
                channel: normalized.channel
              }
            },
            update: {
              customerId: customer?.id ?? null,
              reason: normalized.reason,
              active: true
            },
            create: {
              tenantId,
              customerId: customer?.id ?? null,
              email: normalized.email,
              channel: normalized.channel,
              reason: normalized.reason,
              active: true
            }
          });

          succeededRows += 1;
        } catch (error) {
          failedRows += 1;
          const message = error instanceof Error ? error.message : 'Unknown suppression upsert error';

          await this.prisma.suppressionImportRow.update({
            where: {
              tenantId_importId_rowNum: {
                tenantId,
                importId: suppressionImportId,
                rowNum: row.rowNum
              }
            },
            data: {
              errorCode: 'UPSERT_FAILED',
              errorMessage: message
            }
          });

          errors.push({ rowNum: row.rowNum, code: 'UPSERT_FAILED', message });
        }
      }

      await this.prisma.suppressionImport.update({
        where: { id: suppressionImportId },
        data: {
          status: 'SUCCEEDED',
          processedRows,
          succeededRows,
          failedRows,
          duplicateRows,
          errorJson: errors.slice(0, 100),
          finishedAt: new Date()
        }
      });

      await this.ledger.markState(run.run.id, 'succeeded');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown suppression processing error';

      await this.prisma.suppressionImport.update({
        where: { id: suppressionImportId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorJson: [{ code: 'IMPORT_CRASHED', message }]
        }
      });

      await this.ledger.markState(run.run.id, 'failed', 'IMPORT_CRASHED', message);
      throw error;
    }
  }
}
