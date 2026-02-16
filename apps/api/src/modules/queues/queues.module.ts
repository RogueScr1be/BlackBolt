import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { JobRunLedgerService } from './job-run-ledger.service';

const appRole = process.env.APP_ROLE;
const isWorker = appRole === 'worker';
const queueImports = isWorker
  ? [
      BullModule.forRoot({
        connection: {
          url: requireEnv('REDIS_URL'),
          lazyConnect: false,
          maxRetriesPerRequest: null,
          enableOfflineQueue: false
        }
      })
    ]
  : [];

@Module({
  imports: [
    ...queueImports,
    PrismaModule
  ],
  providers: [JobRunLedgerService],
  exports: [JobRunLedgerService]
})
export class QueuesModule {}
