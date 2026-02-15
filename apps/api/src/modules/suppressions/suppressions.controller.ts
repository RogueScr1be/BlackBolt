import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import type { RequestWithContext } from '../../common/request-context';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { SuppressionsImportService } from './suppressions-import.service';

type UploadedBufferFile = { buffer: Buffer };

@Controller('v1')
@UseGuards(TenantGuard)
export class SuppressionsController {
  constructor(private readonly importService: SuppressionsImportService) {}

  @Post('tenants/:tenantId/suppressions/imports')
  @UseInterceptors(FileInterceptor('file'))
  async createImport(
    @Param('tenantId') tenantId: string,
    @UploadedFile() file: UploadedBufferFile | undefined
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('CSV file is required');
    }

    return this.importService.createImport(tenantId, file.buffer);
  }

  @Get('suppressions/imports/:suppressionImportId')
  async getImportStatus(
    @Param('suppressionImportId') suppressionImportId: string,
    @Req() req: RequestWithContext
  ) {
    return this.importService.getImportStatus(req.tenantId!, suppressionImportId);
  }
}
