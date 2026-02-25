import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [PrismaModule, TenancyModule, OperatorCredentialsModule],
  controllers: [AlertsController],
  providers: [AlertsService, OperatorKeyGuard]
})
export class AlertsModule {}
