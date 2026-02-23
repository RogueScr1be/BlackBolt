import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RevenueEventKind, RevenueEventSource } from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { JobRunLedgerService } from '../queues/job-run-ledger.service';
import { QUEUES } from '../queues/queue.constants';
import { RevenueService } from './revenue.service';
import { REVENUE_IMPORT_IDEMPOTENCY_PREFIX } from './revenue-import.constants';
import type { RevenueImportJobPayload } from './revenue-import.queue';

@Processor(QUEUES.REVENUE_IMPORT)
export class RevenueImportProcessor extends WorkerHost {
  private readonly logger = new Logger(RevenueImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: JobRunLedgerService,
    private readonly revenueService: RevenueService
  ) {
    super();
  }

  async process(job: Job<RevenueImportJobPayload>): Promise<void> {
    const { tenantId, revenueImportId } = job.data;
    const idempotencyKey = `${REVENUE_IMPORT_IDEMPOTENCY_PREFIX}:${tenantId}:${revenueImportId}`;

    const importRecord = await this.prisma.revenueImport.findFirst({
      where: { id: revenueImportId, tenantId }
    });
    if (!importRecord) {
      this.logger.warn(`Revenue import ${revenueImportId} not found for tenant ${tenantId}`);
      return;
    }
    if (importRecord.status === 'SUCCEEDED') {
      return;
    }

    const run = await this.ledger.createRun({
      tenantId,
      queueName: QUEUES.REVENUE_IMPORT,
      jobName: job.name,
      jobId: String(job.id ?? revenueImportId),
      idempotencyKey
    });

    await this.prisma.revenueImport.update({
      where: { id: revenueImportId },
      data: { status: 'RUNNING' }
    });

    try {
      const rows = await this.prisma.revenueImportRow.findMany({
        where: { tenantId, importId: revenueImportId },
        orderBy: { rowNum: 'asc' }
      });

      let processedRows = 0;
      let succeededRows = 0;
      let failedRows = 0;
      let duplicateRows = 0;
      const seen = new Set<string>();
      const errors: Array<{ rowNum: number; code: string; message: string }> = [];

      for (const row of rows) {
        processedRows += 1;
        if (row.errorCode || !row.normalizedJson || typeof row.normalizedJson !== 'object') {
          failedRows += 1;
          await this.prisma.revenueImportRow.update({
            where: { tenantId_importId_rowNum: { tenantId, importId: revenueImportId, rowNum: row.rowNum } },
            data: { status: 'FAILED' }
          });
          if (row.errorCode && row.errorMessage) {
            errors.push({ rowNum: row.rowNum, code: row.errorCode, message: row.errorMessage });
          }
          continue;
        }

        const normalized = row.normalizedJson as {
          occurredAt: string;
          amountCents: number;
          currency: string;
          externalId: string | null;
          customerEmail: string | null;
          customerPhone: string | null;
          description: string | null;
          campaignMessageId: string | null;
          linkCode: string | null;
          providerMessageId: string | null;
        };

        const dedupeFingerprint = this.rowFingerprint(normalized);
        if (seen.has(dedupeFingerprint)) {
          failedRows += 1;
          duplicateRows += 1;
          await this.prisma.revenueImportRow.update({
            where: { tenantId_importId_rowNum: { tenantId, importId: revenueImportId, rowNum: row.rowNum } },
            data: {
              status: 'FAILED',
              errorCode: 'DUPLICATE_IN_FILE',
              errorMessage: 'Duplicate row within revenue import file'
            }
          });
          errors.push({
            rowNum: row.rowNum,
            code: 'DUPLICATE_IN_FILE',
            message: 'Duplicate row within revenue import file'
          });
          continue;
        }
        seen.add(dedupeFingerprint);

        try {
          const customer = normalized.customerEmail
            ? await this.prisma.customer.findFirst({
                where: {
                  tenantId,
                  email: normalized.customerEmail
                },
                select: { id: true }
              })
            : null;

          const deterministicRowKey = `revenue-import-row:${tenantId}:${revenueImportId}:${row.rowNum}:${dedupeFingerprint}`;
          const result = await this.revenueService.createRevenueEvent({
            tenantId,
            idempotencyKey: deterministicRowKey,
            occurredAt: normalized.occurredAt,
            amountCents: normalized.amountCents,
            currency: normalized.currency,
            kind: RevenueEventKind.SALE,
            source: RevenueEventSource.IMPORT,
            externalId: normalized.externalId ?? undefined,
            customerId: customer?.id,
            campaignMessageId: normalized.campaignMessageId ?? undefined,
            linkCode: normalized.linkCode ?? undefined,
            providerMessageId: normalized.providerMessageId ?? undefined,
            description: normalized.description ?? undefined,
            redactedMetadata: {
              import_id: revenueImportId,
              row_num: String(row.rowNum),
              customer_phone: normalized.customerPhone ?? ''
            }
          });

          if (result.deduped) {
            duplicateRows += 1;
          }

          succeededRows += 1;
          await this.prisma.revenueImportRow.update({
            where: { tenantId_importId_rowNum: { tenantId, importId: revenueImportId, rowNum: row.rowNum } },
            data: { status: 'SUCCEEDED', errorCode: null, errorMessage: null }
          });
        } catch (error) {
          failedRows += 1;
          const message = error instanceof Error ? error.message : 'Unknown revenue import row error';
          await this.prisma.revenueImportRow.update({
            where: { tenantId_importId_rowNum: { tenantId, importId: revenueImportId, rowNum: row.rowNum } },
            data: {
              status: 'FAILED',
              errorCode: 'ROW_INGEST_FAILED',
              errorMessage: message
            }
          });
          errors.push({ rowNum: row.rowNum, code: 'ROW_INGEST_FAILED', message });
        }
      }

      await this.prisma.revenueImport.update({
        where: { id: revenueImportId },
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
      const message = error instanceof Error ? error.message : 'Unknown revenue import processing error';
      await this.prisma.revenueImport.update({
        where: { id: revenueImportId },
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

  private rowFingerprint(normalized: {
    occurredAt: string;
    amountCents: number;
    currency: string;
    externalId: string | null;
    customerEmail: string | null;
    description: string | null;
    campaignMessageId: string | null;
    linkCode: string | null;
    providerMessageId: string | null;
  }): string {
    return createHash('sha256')
      .update(
        [
          normalized.occurredAt,
          String(normalized.amountCents),
          normalized.currency,
          normalized.externalId ?? '',
          normalized.customerEmail ?? '',
          normalized.description ?? '',
          normalized.campaignMessageId ?? '',
          normalized.linkCode ?? '',
          normalized.providerMessageId ?? ''
        ].join('|')
      )
      .digest('hex')
      .slice(0, 24);
  }
}
