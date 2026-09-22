import { SettingsController } from './settings.controller.js';
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { PiiEncryptionService } from './encryption.provider.js';
import { PermissionGuard } from './rbac.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  controllers: [SettingsController],
  providers: [PrismaService, PiiEncryptionService, AuditService, PermissionGuard],
  exports: [PrismaService, PiiEncryptionService, AuditService, PermissionGuard],
})
export class CommonModule {}
