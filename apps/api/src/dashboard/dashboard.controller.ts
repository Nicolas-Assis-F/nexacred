import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service.js';
@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async get() {
    const [
      totalLeads,
      validLeads,
      validContacts,
      sent,
      delivered,
      failed,
      responses,
      interested,
      optOuts,
      recentCampaigns,
      daily,
      eligible,
    ] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { status: 'ACTIVE' } }),
      this.prisma.leadContact.count({ where: { status: 'VALID' } }),
      this.prisma.message.count({ where: { status: { in: ['SENT', 'DELIVERED'] } } }),
      this.prisma.message.count({ where: { status: 'DELIVERED' } }),
      this.prisma.message.count({ where: { status: 'FAILED' } }),
      this.prisma.message.count({ where: { direction: 'INBOUND' } }),
      this.prisma.conversation.count({ where: { status: 'INTERESTED' } }),
      this.prisma.suppression.count({ where: { active: true, reason: 'OPT_OUT' } }),
      this.prisma.campaign.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { recipients: true, messages: true } } },
      }),
      this.prisma.$queryRaw<
        Array<{ day: Date; sent: bigint; delivered: bigint; failed: bigint }>
      >`SELECT date_trunc('day', "createdAt") AS day, count(*) FILTER (WHERE status IN ('SENT','DELIVERED')) AS sent, count(*) FILTER (WHERE status='DELIVERED') AS delivered, count(*) FILTER (WHERE status='FAILED') AS failed FROM "Message" WHERE "createdAt" >= now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(DISTINCT l.id) as count FROM "Lead" l JOIN "LeadContact" c ON c."leadId"=l.id WHERE l.status='ACTIVE' AND c.status='VALID' AND NOT EXISTS (SELECT 1 FROM "Suppression" s WHERE s.active AND s."identityHash" IN (l."cpfHash",c."valueHash")) AND (SELECT x.status FROM "Consent" x WHERE x."leadId"=l.id AND (x."contactId"=c.id OR x."contactId" IS NULL) AND x.purpose='CREDIT_MARKETING' AND x.channel::text=CASE WHEN c.type='PHONE' THEN 'SMS' ELSE 'EMAIL' END ORDER BY x."createdAt" DESC LIMIT 1)='GRANTED'`,
    ]);
    return {
      totals: {
        totalLeads,
        validLeads,
        validContacts,
        eligibleLeads: Number(eligible[0]?.count ?? 0),
        sent,
        delivered,
        failed,
        responses,
        interested,
        optOuts,
      },
      daily: daily.map((d) => ({
        day: d.day,
        sent: Number(d.sent),
        delivered: Number(d.delivered),
        failed: Number(d.failed),
      })),
      recentCampaigns,
    };
  }
}
