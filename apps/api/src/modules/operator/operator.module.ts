import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { PostmarkModule } from '../postmark/postmark.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorController } from './operator.controller';
import { OperatorService } from './operator.service';

@Module({
  imports: [PrismaModule, TenancyModule, ReviewsModule, PostmarkModule],
  controllers: [OperatorController],
  providers: [OperatorService]
})
export class OperatorModule {}
