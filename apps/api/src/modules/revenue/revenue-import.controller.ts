import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { RequestWithContext } from '../../common/request-context';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RevenueImportService } from './revenue-import.service';

type UploadedBufferFile = { buffer: Buffer };

@Controller('v1')
@UseGuards(OperatorKeyGuard, TenantGuard)
export class RevenueImportController {
  constructor(private readonly revenueImportService: RevenueImportService) {}

  @Post('tenants/:tenantId/revenue/imports')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file'))
  async createRevenueImport(
    @Param('tenantId') tenantId: string,
    @Req() req: RequestWithContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @UploadedFile() file: UploadedBufferFile | undefined
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('CSV file is required');
    }
    if (req.tenantId !== tenantId) {
      throw new BadRequestException('tenant header does not match route tenant');
    }

    return this.revenueImportService.createImport(tenantId, file.buffer, idempotencyKey);
  }

  @Get('revenue-imports/:revenueImportId')
  async getRevenueImportStatus(@Param('revenueImportId') revenueImportId: string, @Req() req: RequestWithContext) {
    return this.revenueImportService.getImportStatus(req.tenantId!, revenueImportId);
  }

  @Get('tenants/:tenantId/revenue/imports')
  async listRevenueImports(
    @Param('tenantId') tenantId: string,
    @Req() req: RequestWithContext,
    @Query('limit') limit?: string
  ) {
    if (req.tenantId !== tenantId) {
      throw new BadRequestException('tenant header does not match route tenant');
    }
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.revenueImportService.listImports(tenantId, parsedLimit);
  }
}
