import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertsV1Controller } from './alerts-v1.controller';

@Module({
  imports: [PrismaModule, TenancyModule, OperatorCredentialsModule],
  controllers: [AlertsController, AlertsV1Controller],
  providers: [AlertsService, OperatorKeyGuard]
})
export class AlertsModule {}
