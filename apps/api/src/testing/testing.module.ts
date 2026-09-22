import { Module } from '@nestjs/common';
import { TestingController } from './testing.controller.js';
@Module({ controllers: [TestingController] })
export class TestingModule {}
