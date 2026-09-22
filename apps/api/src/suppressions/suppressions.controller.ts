import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../common/audit.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { PermissionGuard, RequirePermission } from '../common/rbac.js';
import type { AuthenticatedRequest } from '../common/request-context.js';
import { CreateSuppressionDto } from './suppressions.dto.js';

@ApiTags('suppressions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('suppressions')
export class SuppressionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  @Get() get() {
    return this.prisma.suppression.findMany({
      where: { active: true },
      include: {
        lead: { select: { name: true, cpfLast4: true } },
        contact: { select: { maskedValue: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  @Post() @RequirePermission('suppression:write') async create(
    @Body() dto: CreateSuppressionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!dto.leadId && !dto.contactId)
      throw new BadRequestException('leadId ou contactId é obrigatório');
    const contact = dto.contactId
      ? await this.prisma.leadContact.findUnique({ where: { id: dto.contactId } })
      : null;
    const lead = dto.leadId
      ? await this.prisma.lead.findUnique({ where: { id: dto.leadId } })
      : null;
    const identityHash = contact?.valueHash ?? lead?.cpfHash;
    if (!identityHash) throw new BadRequestException('Identidade não encontrada');
    const item = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421)`;
      return tx.suppression.create({
        data: { ...dto, leadId: contact?.leadId ?? dto.leadId, identityHash },
      });
    });
    await this.audit.record({
      actorId: req.user.id,
      action: 'SUPPRESSION_CREATED',
      entityType: 'Suppression',
      entityId: item.id,
    });
    return item;
  }
  @Delete(':id') @RequirePermission('suppression:write') async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const existing = await this.prisma.suppression.findUniqueOrThrow({ where: { id } });
    if (existing.reason === 'OPT_OUT')
      throw new BadRequestException('Opt-out não pode ser removido pelo painel');
    const item = await this.prisma.suppression.update({
      where: { id },
      data: { active: false, removedAt: new Date() },
    });
    await this.audit.record({
      actorId: req.user.id,
      action: 'SUPPRESSION_REMOVED',
      entityType: 'Suppression',
      entityId: id,
    });
    return item;
  }
}
