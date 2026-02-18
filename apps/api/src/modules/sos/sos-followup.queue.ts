import { Injectable, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import {
  SOS_FOLLOWUP_SWEEP_JOB_NAME,
  SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_ID,
  SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_NAME
} from './sos.constants';
import type { SosFollowupSweepJobPayload } from './sos.types';

type SosFollowupSchedulerPayload = {
  triggeredBy: 'schedule';
};

@Injectable()
export class SosFollowupQueue implements OnModuleInit {
  constructor(
    @Optional()
    @InjectQueue(QUEUES.SOS_FOLLOWUP_SWEEP)
    private readonly queue?: Queue<SosFollowupSweepJobPayload | SosFollowupSchedulerPayload>
  ) {}

  async onModuleInit() {
    if (!this.queue || process.env.SOS_FOLLOWUP_SWEEP_DISABLED === '1') {
      return;
    }

    const intervalMs = Number.parseInt(process.env.SOS_FOLLOWUP_SWEEP_INTERVAL_MS ?? '86400000', 10);
    if (!Number.isFinite(intervalMs) || intervalMs < 60_000) {
      throw new Error('SOS_FOLLOWUP_SWEEP_INTERVAL_MS must be >= 60000');
    }

    await this.queue.add(
      SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_NAME,
      { triggeredBy: 'schedule' },
      {
        jobId: SOS_FOLLOWUP_SWEEP_SCHEDULER_JOB_ID,
        repeat: { every: intervalMs },
        removeOnComplete: true,
        removeOnFail: false
      }
    );
  }

  async enqueueSweep(input: SosFollowupSweepJobPayload) {
    if (!this.queue) {
      throw new ServiceUnavailableException('SOS follow-up sweep queue is unavailable');
    }
    const job = await this.queue.add(SOS_FOLLOWUP_SWEEP_JOB_NAME, input, {
      jobId: input.idempotencyKey,
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: false,
      removeOnFail: false
    });
    return { jobId: String(job.id), idempotencyKey: input.idempotencyKey };
  }
}
