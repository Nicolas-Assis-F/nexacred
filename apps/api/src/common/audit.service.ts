import { Injectable } from '@nestjs/common';
import type { Prisma } from '@nexacred/database';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  async record(input: {
    actorId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    requestId?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.auditLog.create({ data: input });
  }
}
