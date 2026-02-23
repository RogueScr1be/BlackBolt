import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workerHeartbeat: WorkerHeartbeatService
  ) {}

  async getHealth() {
    const dbOk = await this.checkDatabase();
    const redisOk = await this.checkRedis();
    const workerHeartbeat = await this.workerHeartbeat.readHeartbeatStatus();

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

}
