import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { PortfolioOperatorGuard } from '../../common/guards/portfolio-operator.guard';
import { OperatorPortfolioController } from './operator-portfolio.controller';
import { OperatorPortfolioService } from './operator-portfolio.service';
import { ReviewOperatorActionsService } from './review-operator-actions.service';

@Module({
  imports: [PrismaModule, OperatorCredentialsModule],
  controllers: [OperatorPortfolioController],
  providers: [OperatorPortfolioService, ReviewOperatorActionsService, PortfolioOperatorGuard],
  exports: [OperatorPortfolioService]
})
export class OperatorPortfolioModule {}
