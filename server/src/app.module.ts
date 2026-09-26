import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthThrottlerGuard } from './common/security/auth-throttler.guard.js';
import { validateEnvironment } from './config/env.schema.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { RemindersModule } from './modules/reminders/reminders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      { name: 'network', ttl: 60_000, limit: 100 },
      { name: 'account', ttl: 60_000, limit: 100 },
    ]),
    PrismaModule,
    HealthModule,
    AuthModule,
    RemindersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthThrottlerGuard,
    },
  ],
})
export class AppModule {}
