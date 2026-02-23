import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { PortfolioOperatorGuard } from '../../common/guards/portfolio-operator.guard';
import { OperatorPortfolioController } from './operator-portfolio.controller';
import { OperatorPortfolioService } from './operator-portfolio.service';

@Module({
  imports: [PrismaModule, OperatorCredentialsModule],
  controllers: [OperatorPortfolioController],
  providers: [OperatorPortfolioService, PortfolioOperatorGuard],
  exports: [OperatorPortfolioService]
})
export class OperatorPortfolioModule {}
