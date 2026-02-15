import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';

export const POSTMARK_SEND_JOB_NAME = 'postmark-send';
export const POSTMARK_SEND_SWEEPER_JOB_NAME = 'postmark-send-sweeper';

export type PostmarkSendJobPayload = {
  tenantId: string;
  campaignMessageId: string;
};

type PostmarkSendSweeperJobPayload = {
  triggeredBy: 'schedule';
};

@Injectable()
export class PostmarkSendQueue implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUES.POSTMARK_SEND)
    private readonly queue: Queue<PostmarkSendJobPayload | PostmarkSendSweeperJobPayload>
  ) {}

  async onModuleInit() {
    await this.scheduleSweeper();
  }

  async enqueue(input: PostmarkSendJobPayload) {
    const jobId = `postmark-send:${input.tenantId}:${input.campaignMessageId}`;
    const job = await this.queue.add(POSTMARK_SEND_JOB_NAME, input, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: false,
      removeOnFail: false
    });

    return { jobId: String(job.id) };
  }

  private async scheduleSweeper() {
    const disabled = process.env.POSTMARK_SEND_SWEEPER_DISABLED === '1';
    if (disabled) {
      return;
    }
    const intervalMs = Number.parseInt(process.env.POSTMARK_SEND_SWEEPER_EVERY_MS ?? '300000', 10);
    if (!Number.isFinite(intervalMs) || intervalMs < 60_000) {
      throw new Error('POSTMARK_SEND_SWEEPER_EVERY_MS must be >= 60000');
    }
    await this.queue.add(
      POSTMARK_SEND_SWEEPER_JOB_NAME,
      { triggeredBy: 'schedule' },
      {
        jobId: POSTMARK_SEND_SWEEPER_JOB_NAME,
        repeat: { every: intervalMs },
        removeOnComplete: true,
        removeOnFail: false
      }
    );
  }
}
