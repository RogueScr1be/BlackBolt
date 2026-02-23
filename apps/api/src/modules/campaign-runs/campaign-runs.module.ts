import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { CampaignRunsController } from './campaign-runs.controller';
import { CampaignRunsService } from './campaign-runs.service';

@Module({
  imports: [PrismaModule, TenancyModule, OperatorCredentialsModule],
  controllers: [CampaignRunsController],
  providers: [CampaignRunsService, OperatorKeyGuard],
  exports: [CampaignRunsService]
})
export class CampaignRunsModule {}
