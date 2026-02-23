import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queues/queue.constants';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    const dbOk = await this.checkDatabase();
    const redisOk = await this.checkRedis();
    const workerHeartbeat = await this.checkWorkerHeartbeat();

    return {
      ok: dbOk && redisOk && workerHeartbeat.ok,
      service: 'blackbolt-api',
      version: '1.0.0-phase1',
      checks: {
        db: dbOk,
        redis: redisOk,
        worker_heartbeat: workerHeartbeat.ok,
        last_worker_activity_at: workerHeartbeat.lastActivityAt
      }
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    const url = process.env.REDIS_URL;
    if (!url) {
      return false;
    }

    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_500
    });

    try {
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    } finally {
      client.disconnect();
    }
  }

  private async checkWorkerHeartbeat(): Promise<{ ok: boolean; lastActivityAt: string | null }> {
    try {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000);
      const latest = await this.prisma.jobRun.findFirst({
        where: {
          queueName: { in: [QUEUES.GBP_INGEST, QUEUES.POSTMARK_SEND] }
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });

      if (!latest) {
        return { ok: false, lastActivityAt: null };
      }

      const lastActivityAt = latest.createdAt.toISOString();
      return {
        ok: latest.createdAt >= cutoff,
        lastActivityAt
      };
    } catch {
      return { ok: false, lastActivityAt: null };
    }
  }
}
