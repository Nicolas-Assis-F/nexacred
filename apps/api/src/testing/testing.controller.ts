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
import { PermissionGuard, RequirePermission } from '../common/rbac.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthenticatedRequest } from '../common/request-context.js';
class TestMessageDto {
  @IsUUID() id!: string;
  @IsString() @Length(64, 64) targetId!: string;
  @IsBoolean() consent!: boolean;
  @IsOptional() @IsString() @MaxLength(700) message?: string;
}
@Controller('testing/whatsapp')
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@RequirePermission('user:write')
export class TestingController {
  constructor(private readonly audit: AuditService) {}
  private async request(path: string, body?: object): Promise<unknown> {
    if (process.env.WHATSAPP_LAB_ENABLED !== 'true') {
      if (!body)
        return {
          enabled: false,
          status: 'DISABLED',
          qr: null,
          qrExpiresAt: null,
          note: 'Ative o perfil whatsapp-lab e configure os números de teste no servidor.',
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
  @Post('connect') connect() {
    return this.request('/connect', {});
  }
  @Post('disconnect') disconnect() {
    return this.request('/disconnect', {});
  }
  @Post('send')
  @Throttle({ default: { ttl: 3600000, limit: 5 } })
  async send(@Body() dto: TestMessageDto, @Req() req: AuthenticatedRequest) {
    await this.audit.record({
      actorId: req.user.id,
      action: 'WHATSAPP_TEST_REQUESTED',
      entityType: 'TestMessage',
      entityId: dto.id,
      metadata: { targetHash: dto.targetId, consent: dto.consent },
    });
    const result = await this.request('/send', dto);
    await this.audit.record({
      actorId: req.user.id,
      action: 'WHATSAPP_TEST_PROCESSED',
      entityType: 'TestMessage',
      entityId: dto.id,
    });
    return result;
  }
}
