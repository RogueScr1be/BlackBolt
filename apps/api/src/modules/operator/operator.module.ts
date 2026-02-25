import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { PostmarkModule } from '../postmark/postmark.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { OperatorController } from './operator.controller';
import { OperatorService } from './operator.service';

@Module({
  imports: [PrismaModule, TenancyModule, ReviewsModule, PostmarkModule, OperatorCredentialsModule],
  controllers: [OperatorController],
  providers: [OperatorService, OperatorKeyGuard],
  exports: [OperatorService]
})
export class OperatorModule {}
