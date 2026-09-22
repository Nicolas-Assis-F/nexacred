import { ImportRecovery } from './recovery.service.js';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
@Module({
  imports: [BullModule.registerQueue({ name: 'import-processing' })],
  controllers: [ImportsController],
  providers: [ImportsService, ImportRecovery],
})
export class ImportsModule {}
