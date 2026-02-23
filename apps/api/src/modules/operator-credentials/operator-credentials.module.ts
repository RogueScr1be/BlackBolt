import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperatorCredentialsService } from './operator-credentials.service';

@Module({
  imports: [PrismaModule],
  providers: [OperatorCredentialsService],
  exports: [OperatorCredentialsService]
})
export class OperatorCredentialsModule {}
