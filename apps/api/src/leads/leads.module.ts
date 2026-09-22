import { ConsentsController } from './consents.controller.js';
import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
@Module({ controllers: [LeadsController, ConsentsController], providers: [LeadsService] })
export class LeadsModule {}
