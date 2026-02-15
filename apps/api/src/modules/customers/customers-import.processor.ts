import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { JobRunLedgerService } from '../queues/job-run-ledger.service';
import { QUEUES } from '../queues/queue.constants';
import { toPrismaSegment } from '../common/segment';
import { CUSTOMER_IMPORT_IDEMPOTENCY_PREFIX } from './customers.constants';
import type { CustomerImportJobPayload } from './customers-import.queue';

@Processor(QUEUES.CUSTOMERS_IMPORT)
export class CustomersImportProcessor extends WorkerHost {
  private readonly logger = new Logger(CustomersImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: JobRunLedgerService
  ) {
    super();
  }

  async process(job: Job<CustomerImportJobPayload>): Promise<void> {
    const { tenantId, importId } = job.data;
    const idempotencyKey = `${CUSTOMER_IMPORT_IDEMPOTENCY_PREFIX}:${tenantId}:${importId}`;

    const importRecord = await this.prisma.customerImport.findFirst({
      where: { id: importId, tenantId }
    });

    if (!importRecord) {
      this.logger.warn(`Customer import ${importId} not found for tenant ${tenantId}`);
      return;
    }

    if (importRecord.status === 'SUCCEEDED') {
      this.logger.log(`Skipping already-succeeded import ${importId}`);
      return;
    }

    const run = await this.ledger.createRun({
      tenantId,
      queueName: QUEUES.CUSTOMERS_IMPORT,
      jobName: job.name,
      jobId: String(job.id ?? importId),
      idempotencyKey,
      payloadHash: undefined
    });

    if (!run.created) {
      return;
    }

    await this.prisma.customerImport.update({
      where: { id: importId },
      data: {
        status: 'RUNNING'
      }
    });

    try {
      const rows = await this.prisma.customerImportRow.findMany({
        where: { tenantId, importId },
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
          displayName: string | null;
          externalCustomerRef: string | null;
          lastServiceDate: string | null;
          segment: '0_90' | '90_365' | '365_plus';
        };

        const dedupeKey = normalized.externalCustomerRef
          ? `external:${normalized.externalCustomerRef}`
          : `email:${normalized.email}`;

        if (dedupe.has(dedupeKey)) {
          duplicateRows += 1;
          failedRows += 1;

          await this.prisma.customerImportRow.update({
            where: { tenantId_importId_rowNum: { tenantId, importId, rowNum: row.rowNum } },
            data: {
              errorCode: 'DUPLICATE_IN_FILE',
              errorMessage: 'Duplicate row within import file'
            }
          });

          errors.push({ rowNum: row.rowNum, code: 'DUPLICATE_IN_FILE', message: 'Duplicate row within import file' });
          continue;
        }

        dedupe.add(dedupeKey);

        try {
          if (normalized.externalCustomerRef) {
            await this.prisma.customer.upsert({
              where: {
                tenantId_externalRef: {
                  tenantId,
                  externalRef: normalized.externalCustomerRef
                }
              },
              update: {
                email: normalized.email,
                displayName: normalized.displayName,
                lastServiceDate: normalized.lastServiceDate ? new Date(normalized.lastServiceDate) : null,
                segment: toPrismaSegment(normalized.segment)
              },
              create: {
                tenantId,
                externalRef: normalized.externalCustomerRef,
                email: normalized.email,
                displayName: normalized.displayName,
                lastServiceDate: normalized.lastServiceDate ? new Date(normalized.lastServiceDate) : null,
                segment: toPrismaSegment(normalized.segment)
              }
            });
          } else {
            await this.prisma.customer.upsert({
              where: {
                tenantId_email: {
                  tenantId,
                  email: normalized.email
                }
              },
              update: {
                displayName: normalized.displayName,
                lastServiceDate: normalized.lastServiceDate ? new Date(normalized.lastServiceDate) : null,
                segment: toPrismaSegment(normalized.segment)
              },
              create: {
                tenantId,
                email: normalized.email,
                displayName: normalized.displayName,
                lastServiceDate: normalized.lastServiceDate ? new Date(normalized.lastServiceDate) : null,
                segment: toPrismaSegment(normalized.segment)
              }
            });
          }

          succeededRows += 1;
        } catch (error) {
          failedRows += 1;
          const message = error instanceof Error ? error.message : 'Unknown upsert error';

          await this.prisma.customerImportRow.update({
            where: { tenantId_importId_rowNum: { tenantId, importId, rowNum: row.rowNum } },
            data: {
              errorCode: 'UPSERT_FAILED',
              errorMessage: message
            }
          });

          errors.push({ rowNum: row.rowNum, code: 'UPSERT_FAILED', message });
        }
      }

      await this.prisma.customerImport.update({
        where: { id: importId },
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
      const message = error instanceof Error ? error.message : 'Unknown processing error';

      await this.prisma.customerImport.update({
        where: { id: importId },
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
