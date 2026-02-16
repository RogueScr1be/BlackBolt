import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import Redis from 'ioredis';

import { buildBootBanner, requireEnv, validateWorkerRuntimeEnv } from './runtime/env';

async function preflightRedisConnection() {
  const client = new Redis(requireEnv('REDIS_URL'), {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });

  try {
    await client.ping();
  } finally {
    client.disconnect();
  }
}

async function bootstrapWorker() {
  process.env.APP_ROLE = 'worker';

  try {
    validateWorkerRuntimeEnv();
    await preflightRedisConnection();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown environment validation error';
    console.error(`[boot] role=worker env_validation=failed error="${message}"`);
    process.exit(1);
  }

  console.log(
    buildBootBanner({
      role: 'worker',
      postmarkSendDisabled: process.env.POSTMARK_SEND_DISABLED
    })
  );

  const { WorkerModule } = await import('./worker.module');
  await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log']
  });
}

void bootstrapWorker().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown worker bootstrap error';
  console.error(`[boot] role=worker startup=failed error="${message}"`);
  process.exit(1);
});
