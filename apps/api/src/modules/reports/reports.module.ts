import { Module } from '@nestjs/common';
import { OperatorModule } from '../operator/operator.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';

@Module({
  imports: [OperatorModule, OperatorCredentialsModule],
  controllers: [ReportsController],
  providers: [ReportsService, OperatorKeyGuard]
})
export class ReportsModule {}
