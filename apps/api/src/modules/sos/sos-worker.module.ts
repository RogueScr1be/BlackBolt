import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { QUEUES } from '../queues/queue.constants';
import { SosProcessor } from './sos.processor';
import { SosDriveClient } from './drive/drive.client';
import { SosFollowupProcessor } from './sos-followup.processor';
import { SosModule } from './sos.module';

@Module({
  imports: [
    PrismaModule,
    QueuesModule,
    SosModule,
    BullModule.registerQueue({
      name: QUEUES.SOS_CASE_ORCHESTRATION,
      connection: { url: requireEnv('REDIS_URL') }
    }),
    BullModule.registerQueue({
      name: QUEUES.SOS_FOLLOWUP_SWEEP,
      connection: { url: requireEnv('REDIS_URL') }
    })
  ],
  providers: [SosDriveClient, SosProcessor, SosFollowupProcessor]
})
export class SosWorkerModule {}
