import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { hash } from 'argon2';
import { PrismaService } from '../common/prisma.service.js';
import { PermissionGuard, RequirePermission } from '../common/rbac.js';
class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() name!: string;
  @IsString() @MinLength(12) password!: string;
  @IsIn(['ADMIN', 'MANAGER', 'OPERATOR', 'COMPLIANCE', 'VIEWER']) role!:
    'ADMIN' | 'MANAGER' | 'OPERATOR' | 'COMPLIANCE' | 'VIEWER';
}
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() list() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
  }
  @Post() @RequirePermission('user:write') async create(@Body() dto: CreateUserDto) {
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash: await hash(dto.password),
        role: dto.role,
      },
      select: { id: true, email: true, name: true, role: true },
    });
  }
}
