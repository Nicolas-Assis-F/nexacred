import { Redis } from 'ioredis';
import {TestingModule} from './testing/testing.module.js';
import { AuditInterceptor } from './common/audit.interceptor.js';
import { ErrorFilter } from './common/error.filter.js';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { SegmentsModule } from './segments/segments.module.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { SuppressionsModule } from './suppressions/suppressions.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { AuditModule } from './audit/audit.module.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.cpf',
            'req.body.phone',
          ],
          censor: '[REDACTED]',
        },
        genReqId: (req) => req.headers['x-request-id']?.toString() ?? crypto.randomUUID(),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRoot({
      connection: new Redis(process.env.REDIS_URL ?? 'redis://redis:6379', {
        maxRetriesPerRequest: null,
      }),
    }),
    CommonModule,
    AuthModule,
    ImportsModule,
    LeadsModule,
    SegmentsModule,
    CampaignsModule,
    ConversationsModule,
    SuppressionsModule,
    WebhooksModule,
    DashboardModule,
    AuditModule,
    HealthModule,
    UsersModule,
    TestingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
