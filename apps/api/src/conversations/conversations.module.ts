import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { BotService, RuleIntentClassifier } from './bot.service.js';
import { ConversationsController } from './conversations.controller.js';
@Module({
  imports: [BullModule.registerQueue({ name: 'message-send' })],
  controllers: [ConversationsController],
  providers: [BotService, RuleIntentClassifier],
  exports: [BotService],
})
export class ConversationsModule {}
