import { Module } from '@nestjs/common';
import { SuppressionsController } from './suppressions.controller.js';
@Module({ controllers: [SuppressionsController] })
export class SuppressionsModule {}
