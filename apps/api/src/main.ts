import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { initApiSentry, SentryExceptionFilter } from './common/sentry.filter';

async function bootstrap() {
  initApiSentry();
  const app = await NestFactory.create(AppModule);

  // Ensure static audio cache directory exists
  await mkdir(join(process.cwd(), 'static', 'audio'), { recursive: true });

  app.useGlobalFilters(new SentryExceptionFilter());

  // Trust reverse proxy (Nginx / Cloudflare) to resolve correct client IPs and enable secure cookies
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  app.use(
    helmet({
      // Allow the web app (same-origin via the dev proxy) to load enrichment audio.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  // Generated TTS audio cache, reachable through the /api dev proxy.
  app.use('/api/static', express.static(join(process.cwd(), 'static')));
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
