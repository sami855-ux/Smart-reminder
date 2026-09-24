import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { requestIdMiddleware } from './common/http/request-id.middleware.js';
import type { Environment } from './config/env.schema.js';
import { parseCorsOrigins } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService<Environment, true>);

  app.useLogger(new Logger());
  app.disable('x-powered-by');
  if (config.get('TRUST_PROXY', { infer: true })) {
    app.set('trust proxy', 1);
  }
  app.use(helmet());
  app.use(json({ limit: '32kb' }));
  app.use(urlencoded({ extended: false, limit: '32kb' }));
  app.use(requestIdMiddleware);
  app.enableCors({
    origin: parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true })),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    credentials: false,
    maxAge: 86_400,
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  if (
    config.get('NODE_ENV', { infer: true }) !== 'production' &&
    config.get('SWAGGER_ENABLED', { infer: true })
  ) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Smart Reminder API')
      .setDescription('Versioned API for the Smart Reminder mobile application')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: false },
    });
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`Smart Reminder API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
