import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { normalizeBrazilianPhone } from '@nexacred/shared';
import { PrismaService } from '../common/prisma.service.js';
import { PiiEncryptionService } from '../common/encryption.provider.js';
import { PermissionGuard, RequirePermission } from '../common/rbac.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthenticatedRequest } from '../common/request-context.js';
class TestMessageDto {
  @IsUUID() id!: string;
  @IsOptional() @IsString() @Length(64, 64) targetId?: string;
  @IsString() @Length(10, 25) phone!: string;
  @IsBoolean() consent!: boolean;
  @IsOptional() @IsString() @MaxLength(700) message?: string;
}
@Controller('testing/whatsapp')
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@RequirePermission('user:write')
export class TestingController {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly crypto: PiiEncryptionService,
  ) {}
  private async request(path: string, body?: object): Promise<unknown> {
    if (process.env.WHATSAPP_LAB_ENABLED !== 'true') {
      if (!body)
        return {
          enabled: false,
          status: 'DISABLED',
          qr: null,
          qrExpiresAt: null,
          note: 'Ative o serviço WhatsApp no servidor.',
          allowlist: [],
          attempts: [],
          limits: { hourly: 5, daily: 20 },
        };
      throw new BadRequestException('Laboratório desativado no servidor.');
    }
    let response: Response;
    try {
      response = await fetch(
        `${process.env.WHATSAPP_LAB_URL ?? 'http://whatsapp-lab:3010'}${path}`,
        {
          method: body ? 'POST' : 'GET',
          headers: {
            authorization: `Bearer ${process.env.MOCK_WEBHOOK_SECRET ?? ''}`,
            'content-type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(path === '/send' ? 45000 : 15000),
        },
      );
    } catch {
      throw new BadGatewayException(
        'Laboratório indisponível ou resposta incerta. Confira o serviço antes de tentar outro envio.',
      );
    }
    const value: unknown = await response.json();
    if (!response.ok)
      throw new BadRequestException(
        typeof value === 'object' && value !== null && (value as { message?: unknown }).message
          ? String((value as { message: unknown }).message)
          : 'Falha no laboratório',
      );
    return value;
  }
  @Get() status() {
    return this.request('/status');
  }
  @Post('connect') async connect(@Req() req: AuthenticatedRequest) {
    await this.audit.record({
      actorId: req.user.id,
      action: 'WHATSAPP_CONNECT',
      entityType: 'WhatsAppSession',
    });
    return this.request('/connect', {});
  }
  @Post('disconnect') async disconnect(@Req() req: AuthenticatedRequest) {
    await this.audit.record({
      actorId: req.user.id,
      action: 'WHATSAPP_DISCONNECT',
      entityType: 'WhatsAppSession',
    });
    return this.request('/disconnect', {});
  }
  @Post('send')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async send(@Body() dto: TestMessageDto, @Req() req: AuthenticatedRequest) {
    await this.audit.record({
      actorId: req.user.id,
      action: 'WHATSAPP_TEST_REQUESTED',
      entityType: 'TestMessage',
      entityId: dto.id,
      metadata: { consent: dto.consent },
    });
    const phone = normalizeBrazilianPhone(dto.phone);
    if (!phone) throw new BadRequestException('Informe um telefone brasileiro válido com DDD.');
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421)`;
        const valueHash = this.crypto.hmac(phone);
        const contacts = await tx.leadContact.findMany({
          where: { valueHash },
          include: { lead: true },
        });
        const blocked = await tx.suppression.count({
          where: {
            active: true,
            identityHash: { in: [valueHash, ...contacts.map((c) => c.lead.cpfHash)] },
            OR: [{ channel: null }, { channel: 'WHATSAPP' }],
          },
        });
        if (blocked || contacts.some((c) => c.status !== 'VALID' || c.lead.status !== 'ACTIVE'))
          throw new BadRequestException('Destinatário bloqueado ou inativo.');
        return this.request('/send', { ...dto, phone });
      },
      { timeout: 55000, maxWait: 30000 },
    );
    await this.audit.record({
      actorId: req.user.id,
      action: 'WHATSAPP_TEST_PROCESSED',
      entityType: 'TestMessage',
      entityId: dto.id,
    });
    return result;
  }
}
