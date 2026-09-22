import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { contactFacts, segmentWhere } from '@nexacred/database';
import { Queue } from 'bullmq';
import { contactTypeFor, segmentFiltersSchema } from '@nexacred/shared';
import { AuditService } from '../common/audit.service.js';
import { PrismaService } from '../common/prisma.service.js';
import type { CreateCampaignDto } from './campaigns.dto.js';
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('campaign-preparation') private readonly queue: Queue,
  ) {}
  async create(dto: CreateCampaignDto, actorId: string) {
    if (!dto.requireConsent) throw new BadRequestException('Esta instalação exige consentimento');
    if (
      dto.allowedStartHour >= dto.allowedEndHour ||
      (dto.startAt && dto.endAt && dto.startAt >= dto.endAt)
    )
      throw new BadRequestException('Janela de envio inválida');
    const template = await this.prisma.messageTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template?.active || template.channel !== dto.channel)
      throw new BadRequestException('Template incompatível com canal');
    const item = await this.prisma.campaign.create({
      data: {
        ...dto,
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        endAt: dto.endAt ? new Date(dto.endAt) : null,
      },
    });
    await this.audit.record({
      actorId,
      action: 'CAMPAIGN_CREATED',
      entityType: 'Campaign',
      entityId: item.id,
    });
    return item;
  }
  list() {
    return this.prisma.campaign.findMany({
      include: {
        segment: true,
        template: true,
        _count: { select: { recipients: true, messages: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async get(id: string) {
    const c = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        segment: true,
        template: true,
        _count: { select: { recipients: true, messages: true } },
      },
    });
    if (!c) throw new NotFoundException();
    return c;
  }
  async preview(id: string) {
    const c = await this.get(id);
    const filters = segmentFiltersSchema.parse(c.segment.filters);
    const result = {
      totalSegmented: 0,
      totalContacts: 0,
      suppressed: 0,
      withoutConsent: 0,
      invalid: 0,
      duplicate: 0,
      eligible: 0,
    };
    let cursor: string | undefined;
    const hashes = new Set<string>();
    while (true) {
      const leads = await this.prisma.lead.findMany({
        where: segmentWhere(filters),
        include: { contacts: { where: { type: contactTypeFor(c.channel) } } },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!leads.length) break;
      for (const lead of leads) {
        result.totalSegmented++;
        if (!lead.contacts.length) result.invalid++;
        for (const contact of lead.contacts) {
          result.totalContacts++;
          const facts = await contactFacts(this.prisma, lead.id, contact.id, c.channel);
          if (facts.suppressed) {
            result.suppressed++;
            continue;
          }
          if (contact.status !== 'VALID') {
            result.invalid++;
            continue;
          }
          if (!facts.hasConsent) {
            result.withoutConsent++;
            continue;
          }
          if (hashes.has(contact.valueHash)) {
            result.duplicate++;
            continue;
          }
          hashes.add(contact.valueHash);
          result.eligible++;
        }
      }
      cursor = leads[leads.length - 1]?.id;
    }
    return result;
  }
  async approve(id: string, actorId: string) {
    const changed = await this.prisma.campaign.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() },
    });
    if (!changed.count) throw new BadRequestException('Apenas rascunhos podem ser aprovados');
    await this.audit.record({
      actorId,
      action: 'CAMPAIGN_APPROVED',
      entityType: 'Campaign',
      entityId: id,
    });
    return this.get(id);
  }
  async start(id: string, actorId: string) {
    const changed = await this.prisma.campaign.updateMany({
      where: { id, status: { in: ['APPROVED', 'PAUSED'] } },
      data: { status: 'RUNNING' },
    });
    if (!changed.count) throw new BadRequestException('Aprove a campanha antes de iniciar');
    await this.queue.add(
      'prepare',
      { campaignId: id },
      { jobId: `prepare-${id}`, removeOnComplete: true, removeOnFail: true },
    );
    await this.audit.record({
      actorId,
      action: 'CAMPAIGN_STARTED',
      entityType: 'Campaign',
      entityId: id,
    });
    return this.get(id);
  }
  async transition(id: string, status: 'PAUSED' | 'CANCELLED', actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421)`;
      const changed = await tx.campaign.updateMany({
        where: { id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        data: { status },
      });
      if (!changed.count) throw new BadRequestException('Campanha encerrada');
      if (status === 'CANCELLED')
        await tx.campaignRecipient.updateMany({
          where: { campaignId: id, status: { in: ['PENDING', 'QUEUED'] } },
          data: { status: 'CANCELLED' },
        });
    });
    await this.audit.record({
      actorId,
      action: `CAMPAIGN_${status}`,
      entityType: 'Campaign',
      entityId: id,
    });
    return this.get(id);
  }
}
