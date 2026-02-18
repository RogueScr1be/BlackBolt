import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { QUEUES } from '../queues/queue.constants';
import { SosProcessor } from './sos.processor';
import { SosDriveClient } from './drive/drive.client';

@Module({
  imports: [
    PrismaModule,
    QueuesModule,
    BullModule.registerQueue({
      name: QUEUES.SOS_CASE_ORCHESTRATION,
      connection: { url: requireEnv('REDIS_URL') }
    })
  ],
  providers: [SosDriveClient, SosProcessor]
})
export class SosWorkerModule {}
