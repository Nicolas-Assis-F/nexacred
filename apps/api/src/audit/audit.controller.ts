import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service.js';
import { PermissionGuard, RequirePermission } from '../common/rbac.js';
@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@RequirePermission('audit:read')
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() list(@Query('entityType') entityType?: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType },
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }
}
