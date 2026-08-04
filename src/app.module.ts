import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { MailerModule } from '@nestjs-modules/mailer';
import { GracefulShutdownModule } from 'nestjs-graceful-shutdown';
import { redisStore } from 'cache-manager-redis-yet';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'path';
import * as Joi from 'joi';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

// Namespaces & Strategies
import jwtConfig from './config/namespaces/jwt.config';
import { JwtAccessStrategy } from './config/strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './config/strategies/jwt-refresh.strategy';

// Feature Modules
import { HealthModule } from './modules/health/health.module';
import { AdminsModule } from './modules/admins/admins.module';
import { DatabaseType, DataSourceOptions } from 'typeorm';
import Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
@Module({
  imports: [
    // CONFIGURATION (Strict Validation)
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig],
      validationSchema: Joi.object({
        // App
        APP_NAME: Joi.string().default('MyApp'),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),
        URL: Joi.string().default('http://127.0.0.1'),
        FRONTEND_URL: Joi.string().uri().required(),

        // JWT
        JWT_ACCESS_SECRET: Joi.string().required(),
        JWT_ACCESS_EXPIRY: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string().required(),
        JWT_REFRESH_EXPIRY: Joi.string().required(),

        // DB
        DB_TYPE: Joi.string()
          .valid('mysql', 'postgres', 'mariadb', 'sqlite')
          .required(),
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().required(),
        DB_USERNAME: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        DB_NAME: Joi.string().required(),
        DB_SYNCHRONIZE: Joi.boolean().default(false),

        // Rate Limiter
        RATELIMIT_TTL: Joi.number().default(60000),
        RATELIMIT_MAX: Joi.number().default(10),

        // Cache & Redis
        CACHE_TTL: Joi.number().default(600),
        USE_REDIS: Joi.boolean().default(false),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().default(''),

        // Mail
        MAIL_HOST: Joi.string().required(),
        MAIL_PORT: Joi.number().required(),
        MAIL_USER: Joi.string().required(),
        MAIL_PASS: Joi.string().required(),
        MAIL_FROM: Joi.string().required(),
        SMTP_SECURE: Joi.boolean().default(false),
        SUPPORT_EMAIL: Joi.string().email().required(),
        EMAIL_EXPIRY: Joi.number().default(900000),

        // Company Info
        COMPANY_NAME: Joi.string().required(),
        COPYRIGHT_YEAR: Joi.number().default(new Date().getFullYear()),

        // Captcha
        CAPTCHA_ENABLED: Joi.boolean().default(false),
        CAPTCHA_SECRET: Joi.string().required(),
      }),
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        level: 'info',
        // Redact sensitive information from logs
        redact: ['req.headers.authorization', 'req.body.password'],
      },
    }),

    // GRACEFUL SHUTDOWN (Crucial for Production)
    // TODO: Add this...
    GracefulShutdownModule.forRoot({
      cleanup: () => {
        // You can use app.get() here to close specific connections
        console.log('Finalizing cleanup before shutdown...');
      },
    }),

    // DATABASE
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        return {
          ...({
            type: config.get<string>('DB_TYPE') as DatabaseType,
            host: config.get<string>('DB_HOST'),
            port: config.get<number>('DB_PORT'),
            username: config.get<string>('DB_USERNAME'),
            password: config.get<string>('DB_PASSWORD'),
            database: config.get<string>('DB_NAME'),
            synchronize: config.get<boolean>('DB_SYNCHRONIZE', false),
            extra: {
              connectionLimit: 10,
              queueLimit: 0,
              idleTimeout: 60000,
            },
          } as DataSourceOptions),
          autoLoadEntities: true,
          logging: config.get<string>('NODE_ENV') === 'development',
          maxQueryExecutionTime: 1000,
        };
      },
    }),

    // CACHING (Redis or Memory)
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        if (config.get<boolean>('USE_REDIS')) {
          return {
            store: await redisStore({
              socket: {
                host: config.get<string>('REDIS_HOST'),
                port: config.get<number>('REDIS_PORT'),
                reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
              },
              password: config.get<string>('REDIS_PASSWORD') || undefined,
              ttl: (config.get<number>('CACHE_TTL') || 600) * 1000,
            }),
          };
        }
        return { ttl: (config.get<number>('CACHE_TTL') || 600) * 1000 };
      },
    }),

    // MAILER
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('MAIL_HOST'),
          port: config.get<number>('MAIL_PORT'),
          secure: config.get<boolean>('SMTP_SECURE'),
          auth: config.get('MAIL_USER')
            ? {
                user: config.get('MAIL_USER'),
                pass: config.get('MAIL_PASS'),
              }
            : undefined,
        },
        defaults: { from: config.get('MAIL_FROM') },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),

    // SECURITY: Rate Limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          throttlers: [
            {
              ttl: config.get<number>('RATELIMIT_TTL') ?? 60000,
              limit: config.get<number>('RATELIMIT_MAX') ?? 10,
            },
          ],
          storage: config.get<boolean>('USE_REDIS')
            ? new ThrottlerStorageRedisService(
                new Redis({
                  host: config.get<string>('REDIS_HOST', 'localhost'),
                  port: config.get<number>('REDIS_PORT', 6379),
                }),
              )
            : undefined,
        };
      },
    }),

    // AUTH
    JwtModule.register({}), // Handled dynamically in AuthService
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // APP MODULES
    HealthModule,
    AdminsModule,
    PermissionsModule,
    RolesModule,
  ],
  providers: [JwtAccessStrategy, JwtRefreshStrategy],
})
export class AppModule {}
