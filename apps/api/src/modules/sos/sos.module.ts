import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { QUEUES } from '../queues/queue.constants';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { SosQueue } from './sos.queue';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: QUEUES.SOS_CASE_ORCHESTRATION,
      connection: { url: requireEnv('REDIS_URL') }
    })
  ],
  controllers: [SosController],
  providers: [SosService, SosQueue],
  exports: [SosService]
})
export class SosModule {}
