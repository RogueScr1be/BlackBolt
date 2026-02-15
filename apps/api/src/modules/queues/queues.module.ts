import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { JobRunLedgerService } from './job-run-ledger.service';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: requireEnv('REDIS_URL')
      }
    }),
    PrismaModule
  ],
  providers: [JobRunLedgerService],
  exports: [JobRunLedgerService]
})
export class QueuesModule {}
