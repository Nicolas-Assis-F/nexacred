import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service.js';
@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async get(@Query('days') daysText = '30') {
    const days = Number(daysText);
    if (![7, 30, 90].includes(days))
      throw new BadRequestException('Período deve ser 7, 30 ou 90 dias.');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const endDay = new Date(today + 'T00:00:00-03:00');
    const since = new Date(endDay.getTime() - (days - 1) * 86400000);
    const where = { createdAt: { gte: since } };
    const [
      totalLeads,
      validLeads,
      validContacts,
      messages,
      responses,
      interested,
      optOuts,
      recentCampaigns,
      daily,
      eligible,
      imports,
      recentImports,
      campaigns,
      conversations,
    ] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { status: 'ACTIVE' } }),
      this.prisma.leadContact.count({ where: { status: 'VALID' } }),
      this.prisma.message.groupBy({
        by: ['status'],
        where: { ...where, direction: 'OUTBOUND' },
        _count: true,
      }),
      this.prisma.message.count({ where: { ...where, direction: 'INBOUND' } }),
      this.prisma.conversation.count({ where: { status: { in: ['INTERESTED', 'QUALIFIED'] } } }),
      this.prisma.suppression.count({ where: { ...where, active: true, reason: 'OPT_OUT' } }),
      this.prisma.campaign.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { recipients: true, messages: true } } },
      }),
      this.prisma.$queryRaw<
        Array<{ day: string; sent: bigint; delivered: bigint; failed: bigint; responses: bigint }>
      >`SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day,count(*) FILTER(WHERE direction='OUTBOUND' AND status IN ('SENT','DELIVERED')) AS sent,count(*) FILTER(WHERE direction='OUTBOUND' AND status='DELIVERED') AS delivered,count(*) FILTER(WHERE direction='OUTBOUND' AND status='FAILED') AS failed,count(*) FILTER(WHERE direction='INBOUND') AS responses FROM "Message" WHERE "createdAt">=${since} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(DISTINCT l.id) as count FROM "Lead" l JOIN "LeadContact" c ON c."leadId"=l.id WHERE l.status='ACTIVE' AND c.status='VALID' AND NOT EXISTS (SELECT 1 FROM "Suppression" s WHERE s.active AND s."identityHash" IN (l."cpfHash",c."valueHash")) AND (SELECT x.status FROM "Consent" x WHERE x."leadId"=l.id AND (x."contactId"=c.id OR x."contactId" IS NULL) AND x.purpose='CREDIT_MARKETING' AND x.channel::text=CASE WHEN c.type='PHONE' THEN 'SMS' ELSE 'EMAIL' END ORDER BY x."createdAt" DESC LIMIT 1)='GRANTED'`,
      this.prisma.import.aggregate({
        where,
        _sum: { processedRows: true, validRows: true, invalidRows: true, duplicateRows: true },
        _count: true,
      }),
      this.prisma.import.findMany({
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          filename: true,
          status: true,
          processedRows: true,
          validRows: true,
          invalidRows: true,
        },
      }),
      this.prisma.campaign.groupBy({ by: ['status'], _count: true }),
      this.prisma.conversation.groupBy({ by: ['status'], _count: true }),
    ]);
    const count = (s: string) => messages.find((m) => m.status === s)?._count ?? 0;
    const delivered = count('DELIVERED'),
      sent = delivered + count('SENT'),
      failed = count('FAILED'),
      queued = count('QUEUED');
    const series = Array.from({ length: days }, (_, i) => {
      const date = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10);
      const d = daily.find((x) => x.day === date);
      return {
        day: date,
        sent: Number(d?.sent ?? 0),
        delivered: Number(d?.delivered ?? 0),
        failed: Number(d?.failed ?? 0),
        responses: Number(d?.responses ?? 0),
      };
    });
    return {
      period: { days, since: since.toISOString(), timezone: 'America/Sao_Paulo' },
      totals: {
        totalLeads,
        validLeads,
        validContacts,
        eligibleLeads: Number(eligible[0]?.count ?? 0),
        sent,
        delivered,
        failed,
        queued,
        responses,
        interested,
        optOuts,
      },
      rates: {
        delivery: sent ? (delivered / sent) * 100 : null,
        failure: sent + failed ? (failed / (sent + failed)) * 100 : null,
        importValidity: imports._sum.processedRows
          ? (Number(imports._sum.validRows ?? 0) / imports._sum.processedRows) * 100
          : null,
      },
      daily: series,
      recentCampaigns,
      recentImports,
      importSummary: { total: imports._count, ...imports._sum },
      campaignStatuses: campaigns.map((c) => ({ status: c.status, count: c._count })),
      conversationStatuses: conversations.map((c) => ({ status: c.status, count: c._count })),
      generatedAt: new Date().toISOString(),
    };
  }
}
