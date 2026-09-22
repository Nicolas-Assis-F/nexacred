import { BadRequestException, Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { PrismaService } from '../common/prisma.service.js';
import { PermissionGuard, RequirePermission } from '../common/rbac.js';
import type { AuthenticatedRequest } from '../common/request-context.js';
class ConsentDto {
  @IsUUID() contactId!: string;
  @IsIn(['SMS', 'EMAIL']) channel!: 'SMS' | 'EMAIL';
  @IsIn(['GRANTED', 'REVOKED']) status!: 'GRANTED' | 'REVOKED';
  @IsString() @MinLength(3) source!: string;
  @IsString() @MinLength(5) proof!: string;
  @IsOptional() @IsISO8601() grantedAt?: string;
}
@Controller('leads')
@UseGuards(AuthGuard('jwt'), PermissionGuard)
export class ConsentsController {
  constructor(private readonly prisma: PrismaService) {}
  @Post(':id/consents') @RequirePermission('consent:write') async create(
    @Param('id') id: string,
    @Body() dto: ConsentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const contact = await this.prisma.leadContact.findFirst({
      where: { id: dto.contactId, leadId: id, type: dto.channel === 'SMS' ? 'PHONE' : 'EMAIL' },
    });
    if (!contact) throw new BadRequestException('Contato incompatível');
    if (dto.status === 'GRANTED' && (!dto.grantedAt || new Date(dto.grantedAt) > new Date()))
      throw new BadRequestException('Informe a data real de autorização');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421)`;
      const c = await tx.consent.create({
        data: {
          leadId: id,
          contactId: dto.contactId,
          channel: dto.channel,
          status: dto.status,
          purpose: 'CREDIT_MARKETING',
          source: dto.source,
          proof: { reference: dto.proof },
          grantedAt: dto.status === 'GRANTED' ? new Date(dto.grantedAt!) : null,
          revokedAt: dto.status === 'REVOKED' ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'CONSENT_CHANGED',
          entityType: 'Consent',
          entityId: c.id,
        },
      });
      return c;
    });
  }
}
