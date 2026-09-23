import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Controller('settings')
@UseGuards(AuthGuard('jwt'))
export class SettingsController {
  @Get() get() {
    return {
      provider: process.env.WHATSAPP_LAB_ENABLED === 'true' ? 'WhatsApp (Baileys) · SMS/e-mail simulados' : 'Simulação',
      chatwootEnabled: process.env.CHATWOOT_ENABLED === 'true',
      chatwootUrl: process.env.CHATWOOT_ENABLED === 'true' ? process.env.CHATWOOT_URL : null,
      timezone: 'America/Sao_Paulo',
      retentionDays: Number(process.env.STORAGE_RETENTION_DAYS ?? 7),
    };
  }
}
