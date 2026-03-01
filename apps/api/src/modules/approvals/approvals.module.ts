import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [PrismaModule, TenancyModule, OperatorCredentialsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, OperatorKeyGuard],
  exports: [ApprovalsService]
})
export class ApprovalsModule {}
