import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { buildBootBanner, requireEnv, validateWorkerRuntimeEnv } from './runtime/env';

async function bootstrapWorker() {
  process.env.APP_ROLE = 'worker';

  try {
    validateWorkerRuntimeEnv();
    requireEnv('REDIS_URL');
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
