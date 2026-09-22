import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PermissionGuard, RequirePermission } from '../common/rbac.js';
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../common/request-context.js';
import { ImportsService } from './imports.service.js';

@ApiTags('imports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}
  @Post()
  @RequirePermission('import:write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, _file, cb) => cb(null, randomUUID() + '.xlsb'),
      }),
      limits: { fileSize: 1024 * 1024 * 1024 },
    }),
  )
  create(@UploadedFile() file: Express.Multer.File, @Req() req: AuthenticatedRequest) {
    const body = req.body as { mapping?: string; sheetName?: string };
    return this.service.create(file, body.mapping ?? '{}', body.sheetName, req.user.id);
  }
  @Get() list() {
    return this.service.list();
  }
  @Post(':id/retry')
  @RequirePermission('import:write')
  retry(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.retry(id, req.user.id);
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.service.get(id);
  }
  @Get(':id/errors') errors(
    @Param('id') id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
  ) {
    return this.service.errors(id, page);
  }
}
