import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type JobRunState = 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed' | 'dead_lettered';

@Injectable()
export class JobRunLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: {
    tenantId: string;
    queueName: string;
    jobName: string;
    jobId: string;
    idempotencyKey: string;
    payloadHash?: string;
  }): Promise<{ run: { id: string }; created: boolean }> {
    try {
      const run = await this.prisma.jobRun.create({
        data: {
          tenantId: input.tenantId,
          queueName: input.queueName,
          jobName: input.jobName,
          jobId: input.jobId,
          idempotencyKey: input.idempotencyKey,
          payloadHash: input.payloadHash,
          state: 'queued',
          startedAt: new Date()
        },
        select: { id: true }
      });

      return { run, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.jobRun.findFirst({
          where: {
            tenantId: input.tenantId,
            idempotencyKey: input.idempotencyKey
          },
          select: { id: true }
        });

        if (!existing) {
          throw error;
        }

        return { run: existing, created: false };
      }

      throw error;
    }
  }

  async markState(
    id: string,
    state: JobRunState,
    errorCode?: string,
    errorMessage?: string,
    metadataJson?: Prisma.InputJsonValue
  ) {
    return this.prisma.jobRun.update({
      where: { id },
      data: {
        state,
        errorCode,
        errorMessage,
        metadataJson,
        finishedAt: state === 'succeeded' || state === 'failed' || state === 'dead_lettered' ? new Date() : null
      }
    });
  }
}
