import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';
import { TemplatesController } from './templates.controller.js';
@Module({
  imports: [BullModule.registerQueue({ name: 'campaign-preparation' })],
  controllers: [CampaignsController, TemplatesController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
