import { PermissionGuard, RequirePermission } from '../common/rbac.js';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { segmentFiltersSchema } from '@nexacred/shared';
import { PrismaService } from '../common/prisma.service.js';
import { CreateSegmentDto } from './segments.dto.js';

@ApiTags('segments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('segments')
export class SegmentsController {
  constructor(private readonly prisma: PrismaService) {}
  @Post() @RequirePermission('segment:write') create(@Body() dto: CreateSegmentDto) {
    return this.prisma.segment.create({
      data: {
        name: dto.name,
        description: dto.description,
        filters: segmentFiltersSchema.parse(dto.filters),
      },
    });
  }
  @Get() list() {
    return this.prisma.segment.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
