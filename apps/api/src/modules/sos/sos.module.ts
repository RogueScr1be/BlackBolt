import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { requireEnv } from '../../runtime/env';
import { PrismaModule } from '../prisma/prisma.module';
import { QUEUES } from '../queues/queue.constants';
import { SosCasesController } from './sos-cases.controller';
import { SosController } from './sos.controller';
import { SosIntakeController } from './sos-intake.controller';
import { SosSchedulerController } from './sos-scheduler.controller';
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
  controllers: [SosController, SosIntakeController, SosCasesController, SosSchedulerController],
  providers: [SosService, SosQueue],
  exports: [SosService]
})
export class SosModule {}
