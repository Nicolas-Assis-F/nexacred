import { PermissionGuard, RequirePermission } from '../common/rbac.js';
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/request-context.js';
import { CampaignsService } from './campaigns.service.js';
import { CreateCampaignDto } from './campaigns.dto.js';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}
  @Post() @RequirePermission('campaign:write') create(
    @Body() dto: CreateCampaignDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.create(dto, req.user.id);
  }
  @Get() list() {
    return this.service.list();
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.service.get(id);
  }
  @Post(':id/preview') preview(@Param('id') id: string) {
    return this.service.preview(id);
  }
  @Post(':id/approve') @RequirePermission('campaign:start') approve(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.approve(id, req.user.id);
  }
  @Post(':id/start') @RequirePermission('campaign:start') start(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.start(id, req.user.id);
  }
  @Post(':id/pause') @RequirePermission('campaign:start') pause(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.transition(id, 'PAUSED', req.user.id);
  }
  @Post(':id/cancel') @RequirePermission('campaign:start') cancel(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.transition(id, 'CANCELLED', req.user.id);
  }
}
