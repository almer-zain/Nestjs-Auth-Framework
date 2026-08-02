import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { VersioningType } from '@nestjs/common';

import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { setupGracefulShutdown } from 'nestjs-graceful-shutdown';
import compression from 'compression';
import hpp from 'hpp';
import { Application } from 'express';
import { Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Use Pino as the global logger
  app.useLogger(app.get(Logger));

  // Get ConfigService to replace the old AppService
  const configService = app.get(ConfigService);

  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isProd = nodeEnv === 'production';

  // Enable API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1', // All routes default to /v1/
  });

  // Connect the microservice (e.g., TCP)
  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: configService.get<number>('MICROSERVICE_PORT', 3001),
    },
  });

  /**
   * Proxy Security
   * Trust proxy is required for rate limiting and secure cookies behind Nginx/Cloudflare
   */
  if (isProd) {
    // 2. Cast the instance as an Express Application
    const expressApp = app.getHttpAdapter().getInstance() as Application;

    expressApp.set('trust proxy', 1);
  }

  // Performance: Gzip Compression
  app.use(compression());

  // Security: Helmet (CSP, HSTS, etc.)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: isProd
          ? {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", 'data:'],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              frameAncestors: ["'none'"],
            }
          : {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'", 'https:', "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
            },
      },
    }),
  );

  // Security: CORS
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL'),
    credentials: true,
  });

  // Security: Prevent HTTP Parameter Pollution
  app.use(hpp());

  app.use(cookieParser());

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger Documentation (Enabled only in non-production)
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('My API')
      .setDescription('API Description')
      .setVersion('1.0')
      .addBearerAuth() // Adds JWT support to Swagger UI
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  // Global Exception Filter (Standardizes error output for Pinia)
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global Logging Interceptor (Standardizes server logs)
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Setup Graceful Shutdown
  app.enableShutdownHooks();
  setupGracefulShutdown({ app });

  const port = configService.get<number>('PORT', 3000);
  const url = configService.get<string>('URL', 'localhost');
  await app.listen(port, url);

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap().catch((error: unknown) => {
  console.error('Failed to start the application:', error);
  process.exit(1);
});
