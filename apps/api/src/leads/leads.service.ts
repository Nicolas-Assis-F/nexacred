import { Injectable, NotFoundException } from '@nestjs/common';
import { maskCpf } from '@nexacred/shared';
import { AuditService } from '../common/audit.service.js';
import { PiiEncryptionService } from '../common/encryption.provider.js';
import { PrismaService } from '../common/prisma.service.js';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: PiiEncryptionService,
    private readonly audit: AuditService,
  ) {}
  async list(query: {
    page: number;
    limit: number;
    search?: string;
    organization?: string;
    status?: string;
  }) {
    const where = {
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
      ...(query.organization
        ? { organization: { contains: query.organization, mode: 'insensitive' as const } }
        : {}),
      ...(query.status
        ? { status: query.status as 'ACTIVE' | 'INVALID' | 'SUPPRESSED' | 'ARCHIVED' }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: {
          contacts: { where: { isPrimary: true }, select: { maskedValue: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return {
      items: items.map(({ cpfEncrypted: _cpf, cpfHash: _hash, ...lead }) => ({
        ...lead,
        cpfMasked: maskCpf(lead.cpfLast4),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  async get(id: string, canViewPii: boolean, actorId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        contacts: true,
        consents: true,
        suppressions: { where: { active: true } },
        sources: true,
      },
    });
    if (!lead) throw new NotFoundException();
    const { cpfEncrypted, cpfHash: _hash, ...safe } = lead;
    if (!canViewPii)
      return {
        ...safe,
        cpfMasked: maskCpf(lead.cpfLast4),
        contacts: lead.contacts.map(({ valueEncrypted: _v, valueHash: _h, ...c }) => c),
      };
    await this.audit.record({ actorId, action: 'PII_VIEWED', entityType: 'Lead', entityId: id });
    return {
      ...safe,
      cpf: this.crypto.decrypt(cpfEncrypted),
      contacts: lead.contacts.map(({ valueEncrypted, valueHash: _h, ...c }) => ({
        ...c,
        value: this.crypto.decrypt(valueEncrypted),
      })),
    };
  }
}
