import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toApiSegment, toPrismaSegment, type CustomerSegmentApi } from '../common/segment';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(input: {
    tenantId: string;
    limit: number;
    cursor?: string;
    segment?: CustomerSegmentApi;
  }) {
    const where: Record<string, unknown> = { tenantId: input.tenantId };
    if (input.segment) {
      where.segment = toPrismaSegment(input.segment);
    }

    const rows = await this.prisma.customer.findMany({
      where,
      take: input.limit + 1,
      ...(input.cursor
        ? {
            cursor: { id: input.cursor },
            skip: 1
          }
        : {}),
      orderBy: { id: 'asc' }
    });

    const hasNext = rows.length > input.limit;
    const items = hasNext ? rows.slice(0, input.limit) : rows;

    return {
      items: items.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        externalCustomerRef: item.externalRef,
        email: item.email,
        displayName: item.displayName,
        lastServiceDate: item.lastServiceDate,
        segment: toApiSegment(item.segment),
        createdAt: item.createdAt
      })),
      nextCursor: hasNext ? items[items.length - 1]?.id ?? null : null
    };
  }

  async getCustomerImportStatus(tenantId: string, importId: string) {
    const item = await this.prisma.customerImport.findFirst({
      where: { id: importId, tenantId }
    });

    if (!item) {
      throw new NotFoundException('Import not found');
    }

    return {
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
