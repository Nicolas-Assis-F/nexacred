import { Module } from '@nestjs/common';
import { SegmentsController } from './segments.controller.js';
@Module({ controllers: [SegmentsController] })
export class SegmentsModule {}
