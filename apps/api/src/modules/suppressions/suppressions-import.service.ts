import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CSV_LIMIT_BYTES, type ApiImportStatus } from '../common/import-types';
import { prepareSuppressionImportRowsFromCsv } from '../common/csv-import';
import { SuppressionsImportQueue } from './suppressions-import.queue';

@Injectable()
export class SuppressionsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: SuppressionsImportQueue
  ) {}

  async createImport(tenantId: string, fileBuffer: Buffer) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('CSV file is required');
    }

    if (fileBuffer.length > CSV_LIMIT_BYTES) {
      throw new BadRequestException('CSV file exceeds 5MB limit');
    }

    const csvText = fileBuffer.toString('utf8');
    const preparedRows = prepareSuppressionImportRowsFromCsv(csvText);

    const importRecord = await this.prisma.suppressionImport.create({
      data: {
        tenantId,
        status: 'QUEUED',
        totalRows: preparedRows.length,
        processedRows: 0,
        succeededRows: 0,
        failedRows: 0,
        duplicateRows: 0
      }
    });

    if (preparedRows.length > 0) {
      await this.prisma.suppressionImportRow.createMany({
        data: preparedRows.map((row) => ({
          tenantId,
          importId: importRecord.id,
          rowNum: row.rowNum,
          rawJson: row.rawJson,
          normalizedJson: row.normalizedJson ?? Prisma.JsonNull,
          errorCode: row.errorCode,
          errorMessage: row.errorMessage
        }))
      });
    }

    await this.queue.enqueue({ tenantId, suppressionImportId: importRecord.id });

    return {
      suppressionImportId: importRecord.id,
      status: importRecord.status.toLowerCase() as ApiImportStatus
    };
  }

  async getImportStatus(tenantId: string, suppressionImportId: string) {
    const item = await this.prisma.suppressionImport.findFirst({
      where: { id: suppressionImportId, tenantId }
    });

    if (!item) {
      throw new NotFoundException('Suppression import not found');
    }

    return {
      suppressionImportId: item.id,
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
}
