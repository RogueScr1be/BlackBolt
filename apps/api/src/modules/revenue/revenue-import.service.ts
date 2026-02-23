import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prepareRevenueImportRowsFromCsv } from '../common/csv-import';
import { CSV_LIMIT_BYTES, type ApiImportStatus } from '../common/import-types';
import { PrismaService } from '../prisma/prisma.service';
import { RevenueImportQueue } from './revenue-import.queue';

@Injectable()
export class RevenueImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: RevenueImportQueue
  ) {}

  async createImport(tenantId: string, fileBuffer: Buffer, idempotencyKey?: string) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('CSV file is required');
    }
    if (fileBuffer.length > CSV_LIMIT_BYTES) {
      throw new BadRequestException('CSV file exceeds 5MB limit');
    }

    const csvText = fileBuffer.toString('utf8');
    const preparedRows = prepareRevenueImportRowsFromCsv(csvText);
    const effectiveIdempotencyKey = idempotencyKey?.trim() || this.hashBuffer(fileBuffer);

    const importRecord = await this.prisma.revenueImport.upsert({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey: effectiveIdempotencyKey
        }
      },
      update: {},
      create: {
        tenantId,
        status: 'QUEUED',
        idempotencyKey: effectiveIdempotencyKey,
        totalRows: preparedRows.length,
        processedRows: 0,
        succeededRows: 0,
        failedRows: 0,
        duplicateRows: 0
      }
    });

    const existingRowCount = await this.prisma.revenueImportRow.count({
      where: { tenantId, importId: importRecord.id }
    });
    if (existingRowCount === 0 && preparedRows.length > 0) {
      await this.prisma.revenueImportRow.createMany({
        data: preparedRows.map((row) => ({
          tenantId,
          importId: importRecord.id,
          rowNum: row.rowNum,
          rawJson: row.rawJson,
          normalizedJson: row.normalizedJson ?? Prisma.JsonNull,
          status: 'QUEUED',
          errorCode: row.errorCode,
          errorMessage: row.errorMessage
        }))
      });
    }

    await this.queue.enqueue({
      tenantId,
      revenueImportId: importRecord.id
    });

    return {
      revenueImportId: importRecord.id,
      status: importRecord.status.toLowerCase() as ApiImportStatus
    };
  }

  async getImportStatus(tenantId: string, revenueImportId: string) {
    const item = await this.prisma.revenueImport.findFirst({
      where: { id: revenueImportId, tenantId }
    });

    if (!item) {
      throw new NotFoundException('Revenue import not found');
    }

    return {
      revenueImportId: item.id,
      importId: item.id,
      tenantId: item.tenantId,
      status: item.status.toLowerCase(),
      totalRows: item.totalRows,
      processedRows: item.processedRows,
      succeededRows: item.succeededRows,
      failedRows: item.failedRows,
      duplicateRows: item.duplicateRows,
      errors: item.errorJson ?? [],
      createdAt: item.createdAt,
      finishedAt: item.finishedAt
    };
  }

  async listImports(tenantId: string, limit = 20) {
    const rows = await this.prisma.revenueImport.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100))
    });

    return {
      items: rows.map((row) => ({
        revenueImportId: row.id,
        tenantId: row.tenantId,
        status: row.status.toLowerCase(),
        totalRows: row.totalRows,
        processedRows: row.processedRows,
        succeededRows: row.succeededRows,
        failedRows: row.failedRows,
        duplicateRows: row.duplicateRows,
        createdAt: row.createdAt,
        finishedAt: row.finishedAt
      }))
    };
  }

  private hashBuffer(fileBuffer: Buffer): string {
    return createHash('sha256').update(fileBuffer).digest('hex').slice(0, 40);
  }
}
