import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';
import { buildBootBanner, validateRequiredRuntimeEnv } from './runtime/env';

async function bootstrapWorker() {
  try {
    validateRequiredRuntimeEnv();
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

  await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log']
  });
}

void bootstrapWorker().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown worker bootstrap error';
  console.error(`[boot] role=worker startup=failed error="${message}"`);
  process.exit(1);
});
