import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CustomersImportService } from './customers-import.service';
import { CustomersService } from './customers.service';
import type { CustomerSegmentApi } from '../common/segment';

type UploadedBufferFile = { buffer: Buffer };

@Controller('v1/tenants/:tenantId/customers')
@UseGuards(TenantGuard)
export class CustomersController {
  constructor(
    private readonly importService: CustomersImportService,
    private readonly customersService: CustomersService
  ) {}

  @Post('imports')
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

  @Get()
  async listCustomers(
    @Param('tenantId') tenantId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor: string | undefined,
    @Query('segment') segment: CustomerSegmentApi | undefined
  ) {
    if (segment && !['0_90', '90_365', '365_plus'].includes(segment)) {
      throw new BadRequestException('Invalid segment filter');
    }

    return this.customersService.listCustomers({
      tenantId,
      limit: Math.max(1, Math.min(limit, 200)),
      cursor,
      segment
    });
  }
}
