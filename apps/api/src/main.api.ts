import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { json } from 'express';

import { AppModule } from './app.module';
import type { RequestWithContext } from './common/request-context';
import { buildBootBanner, validateRequiredRuntimeEnv } from './runtime/env';

async function bootstrapApi() {
  try {
    validateRequiredRuntimeEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown environment validation error';
    console.error(`[boot] role=api env_validation=failed error="${message}"`);
    process.exit(1);
  }

  console.log(
    buildBootBanner({
      role: 'api',
      port: process.env.PORT
    })
  );

  const app = await NestFactory.create(AppModule);
  app.use(
    json({
      verify: (req, _res, buf) => {
        (req as RequestWithContext).rawBody = Buffer.from(buf);
      }
    })
  );
  app.setGlobalPrefix('');
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrapApi().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown API bootstrap error';
  console.error(`[boot] role=api startup=failed error="${message}"`);
  process.exit(1);
});
