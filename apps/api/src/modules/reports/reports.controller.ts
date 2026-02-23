import { Controller, Get, Header, Param, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ReportsService } from './reports.service';

@Controller('v1/tenants/:tenantId/reports')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('monthly/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async getMonthlyCsv(
    @Param('tenantId') tenantId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('month') month?: string
  ): Promise<string> {
    const effectiveMonth = month ?? new Date().toISOString().slice(0, 7);
    const csv = await this.reportsService.generateMonthlyCsv(tenantId, effectiveMonth);
    const filename = `blackbolt-report-${tenantId}-${effectiveMonth}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Get('monthly/pdf')
  @Header('Content-Type', 'application/pdf')
  async getMonthlyPdf(
    @Param('tenantId') tenantId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('month') month?: string
  ): Promise<StreamableFile> {
    const effectiveMonth = month ?? new Date().toISOString().slice(0, 7);
    const pdf = await this.reportsService.generateMonthlyPdf(tenantId, effectiveMonth);
    const filename = `blackbolt-report-${tenantId}-${effectiveMonth}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(pdf);
  }
}
