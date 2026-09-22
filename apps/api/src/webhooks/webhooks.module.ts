import { BullModule } from '@nestjs/bullmq'; import { Module } from '@nestjs/common'; import { WebhooksController } from './webhooks.controller.js';
@Module({ imports: [BullModule.registerQueue({ name: 'webhook-processing' })], controllers: [WebhooksController] }) export class WebhooksModule {}
