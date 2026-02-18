import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobRunLedgerService } from '../queues/job-run-ledger.service';
import { QUEUES } from '../queues/queue.constants';
import { SOS_FOLLOWUP_SWEEP_JOB_NAME, SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_NAME } from './sos.constants';
import { SosFollowupQueue } from './sos-followup.queue';
import { SosService } from './sos.service';
import type { SosFollowupSweepJobPayload } from './sos.types';

@Processor(QUEUES.SOS_FOLLOWUP_SWEEP)
export class SosFollowupProcessor extends WorkerHost {
  private readonly logger = new Logger(SosFollowupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: JobRunLedgerService,
    private readonly sosService: SosService,
    private readonly followupQueue: SosFollowupQueue
  ) {
    super();
  }

  async process(job: Job<SosFollowupSweepJobPayload | { triggeredBy: 'schedule' }>): Promise<void> {
    if (job.name === SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_NAME) {
      await this.scheduleTenantSweepJobs();
      return;
    }
    if (job.name !== SOS_FOLLOWUP_SWEEP_JOB_NAME) {
      this.logger.warn(`Unknown SOS follow-up job name ${job.name}`);
      return;
    }

    const payload = job.data as SosFollowupSweepJobPayload;
    const run = await this.ledger.createRun({
      tenantId: payload.tenantId,
      queueName: QUEUES.SOS_FOLLOWUP_SWEEP,
      jobName: job.name,
      jobId: String(job.id ?? payload.idempotencyKey),
      idempotencyKey: payload.idempotencyKey
    });

    try {
      const summary = await this.sosService.runFollowupSweep({
        tenantId: payload.tenantId,
        windowStartDays: payload.windowStartDays,
        windowEndDays: payload.windowEndDays
      });

      await this.ledger.markState(run.run.id, 'succeeded', undefined, undefined, {
        tenantId: payload.tenantId,
        dueCount: summary.dueCount,
        queuedCount: summary.queuedCount,
        skippedCount: summary.skippedCount
      } as Prisma.InputJsonValue);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SOS follow-up sweep failed';
      await this.ledger.markState(run.run.id, 'failed', 'SOS_FOLLOWUP_SWEEP_FAILED', message);
      await this.prisma.integrationAlert.create({
        data: {
          tenantId: payload.tenantId,
          integration: 'sos',
          code: 'SOS_FOLLOWUP_SWEEP_FAILED',
          severity: 'HIGH',
          message: message.slice(0, 240),
          metadataJson: {
            queue: QUEUES.SOS_FOLLOWUP_SWEEP,
            idempotencyKey: payload.idempotencyKey
          } as Prisma.InputJsonValue
        }
      });
      throw error;
    }
  }

  private async scheduleTenantSweepJobs() {
    const tenantRows = await this.prisma.sosCase.findMany({
      select: { tenantId: true },
      distinct: ['tenantId']
    });
    const nowBucket = new Date().toISOString().slice(0, 13);

    for (const row of tenantRows) {
      await this.followupQueue.enqueueSweep({
        tenantId: row.tenantId,
        windowStartDays: 30,
        windowEndDays: 60,
        triggeredBy: 'scheduler',
        idempotencyKey: `sos-followup-sweep:${row.tenantId}:${nowBucket}`
      });
    }
  }
}
