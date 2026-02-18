import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SosService } from './sos.service';
import type { SosSoapInput } from './sos.types';

@Controller('v1/sos/cases')
export class SosCasesController {
  constructor(private readonly sosService: SosService) {}

  @Get()
  async listCases(
    @Query('tenantId') tenantId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('limit') limitRaw: string | undefined
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.sosService.listCases({ tenantId: tenantId ?? '', status, limit });
  }

  @Get(':caseId')
  async getCaseDetail(@Param('caseId') caseId: string, @Query('tenantId') tenantId: string | undefined) {
    return this.sosService.getCaseDetail({ tenantId: tenantId ?? '', caseId });
  }

  @Post(':caseId/soap')
  async saveSoap(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string | undefined,
    @Body() soap: SosSoapInput
  ) {
    return this.sosService.saveSoap({ tenantId: tenantId ?? '', caseId, soap });
  }

  @Post(':caseId/pedi-intake/generate')
  async generatePediIntake(@Param('caseId') caseId: string, @Query('tenantId') tenantId: string | undefined) {
    return this.sosService.generatePediIntake({ tenantId: tenantId ?? '', caseId });
  }
}
