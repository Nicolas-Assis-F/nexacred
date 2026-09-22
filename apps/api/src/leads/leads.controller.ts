import {
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { hasPermission } from '@nexacred/shared';
import type { AuthenticatedRequest } from '../common/request-context.js';
import { LeadsService } from './leads.service.js';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('leads')
export class LeadsController {
  constructor(private readonly service: LeadsService) {}
  @Get() list(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 25,
    @Query('search') search?: string,
    @Query('organization') organization?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list({
      page: Math.max(1, page),
      limit: Math.min(100, Math.max(1, limit)),
      search,
      organization,
      status,
    });
  }
  @Get(':id') get(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Query('includePii', new ParseBoolPipe({ optional: true })) includePii = false,
  ) {
    return this.service.get(
      id,
      includePii && hasPermission(req.user.role, 'pii:read'),
      req.user.id,
    );
  }
}
