import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

const DEFAULT_HEARTBEAT_KEY = 'blackbolt:worker:heartbeat';
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HEARTBEAT_TTL_SECONDS = 300;
const DEFAULT_HEARTBEAT_MAX_AGE_MS = 15 * 60 * 1000;

type HeartbeatStatus = {
  ok: boolean;
  lastActivityAt: string | null;
};

function parsePositiveInteger(raw: string | undefined, fallback: number, min: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private readonly heartbeatKey = process.env.WORKER_HEARTBEAT_KEY?.trim() || DEFAULT_HEARTBEAT_KEY;
  private readonly heartbeatIntervalMs = parsePositiveInteger(
    process.env.WORKER_HEARTBEAT_INTERVAL_MS,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    1_000
  );
  private readonly heartbeatTtlSeconds = parsePositiveInteger(
    process.env.WORKER_HEARTBEAT_TTL_SECONDS,
    DEFAULT_HEARTBEAT_TTL_SECONDS,
    5
  );
  private readonly heartbeatMaxAgeMs = parsePositiveInteger(
    process.env.HEALTH_WORKER_HEARTBEAT_MAX_AGE_MS,
    DEFAULT_HEARTBEAT_MAX_AGE_MS,
    1_000
  );

  private publisherClient: Redis | null = null;
  private publisherInterval: NodeJS.Timeout | null = null;

  async onModuleInit() {
    if (process.env.APP_ROLE !== 'worker') {
      return;
    }
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.error('REDIS_URL missing; worker heartbeat publisher disabled');
      return;
    }

    const client = this.createRedisClient(redisUrl);
    this.publisherClient = client;
    try {
      await client.connect();
      await this.publishWithClient(client);
      this.publisherInterval = setInterval(() => {
        void this.publishWithClient(client);
      }, this.heartbeatIntervalMs);
      this.publisherInterval.unref?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown heartbeat initialization error';
      this.logger.error(`Failed to initialize worker heartbeat publisher: ${message}`);
    }
  }

  async onModuleDestroy() {
    if (this.publisherInterval) {
      clearInterval(this.publisherInterval);
      this.publisherInterval = null;
    }
    if (this.publisherClient) {
      this.publisherClient.disconnect();
      this.publisherClient = null;
    }
  }

  async readHeartbeatStatus(): Promise<HeartbeatStatus> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return { ok: false, lastActivityAt: null };
    }

    const client = this.createRedisClient(redisUrl);
    try {
      await client.connect();
      const raw = await client.get(this.heartbeatKey);
      if (!raw) {
        return { ok: false, lastActivityAt: null };
      }

      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, lastActivityAt: null };
      }

      const lastActivityAt = parsed.toISOString();
      return {
        ok: Date.now() - parsed.getTime() <= this.heartbeatMaxAgeMs,
        lastActivityAt
      };
    } catch {
      return { ok: false, lastActivityAt: null };
    } finally {
      client.disconnect();
    }
  }

  private async publishWithClient(client: Redis) {
    try {
      await client.set(this.heartbeatKey, new Date().toISOString(), 'EX', this.heartbeatTtlSeconds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown heartbeat publish error';
      this.logger.warn(`Failed to publish worker heartbeat: ${message}`);
    }
  }

  private createRedisClient(redisUrl: string): Redis {
    return new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_500
    });
  }
}
