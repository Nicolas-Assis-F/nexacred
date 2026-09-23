import { PermissionGuard, RequirePermission } from '../common/rbac.js';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../common/prisma.service.js';
class CreateTemplateDto {
  @IsString() name!: string;
  @IsIn(['SMS', 'EMAIL', 'WHATSAPP']) channel!: 'SMS' | 'EMAIL' | 'WHATSAPP';
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(3) body!: string;
}
@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() list() {
    return this.prisma.messageTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  }
  @Post() @RequirePermission('template:write') create(@Body() dto: CreateTemplateDto) {
    return this.prisma.messageTemplate.create({ data: dto });
  }
}
