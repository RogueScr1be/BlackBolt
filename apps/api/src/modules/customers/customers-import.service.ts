import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CSV_LIMIT_BYTES, type ApiImportStatus } from '../common/import-types';
import { prepareCustomerImportRowsFromCsv } from '../common/csv-import';
import { CustomersImportQueue } from './customers-import.queue';

@Injectable()
export class CustomersImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: CustomersImportQueue
  ) {}

  async createImport(tenantId: string, fileBuffer: Buffer) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('CSV file is required');
    }

    if (fileBuffer.length > CSV_LIMIT_BYTES) {
      throw new BadRequestException('CSV file exceeds 5MB limit');
    }

    const csvText = fileBuffer.toString('utf8');
    const preparedRows = prepareCustomerImportRowsFromCsv(csvText);

    const importRecord = await this.prisma.customerImport.create({
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
      await this.prisma.customerImportRow.createMany({
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

    await this.queue.enqueue({ tenantId, importId: importRecord.id });

    return {
      importId: importRecord.id,
      status: importRecord.status.toLowerCase() as ApiImportStatus
    };
  }
}
