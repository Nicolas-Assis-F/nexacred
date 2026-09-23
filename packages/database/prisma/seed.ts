import { PrismaClient, type Channel, type MessageStatus, type RecipientStatus } from '@prisma/client';
import { hash } from 'argon2';
import { EncryptionService } from '@nexacred/shared';
const db = new PrismaClient();

const DEMO_PROVIDER = 'mock-demo';
const day = (offset: number) => new Date(Date.now() - offset * 86400000);

async function main() {
  if (process.env.SEED_DEMO !== 'true') return;
  const email = process.env.DEV_ADMIN_EMAIL ?? 'admin@nexacred.local';
  const password = process.env.DEV_ADMIN_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('DEV_ADMIN_PASSWORD requires 12+ characters');
  const admin = await db.user.upsert({
    where: { email },
    create: { email, name: 'Administrador', role: 'ADMIN', passwordHash: await hash(password) },
    update: {},
  });
  const crypto = new EncryptionService(
    process.env.PII_ENCRYPTION_KEY ?? '',
    process.env.PII_HMAC_SECRET ?? '',
  );
  // Synthetic identities for development only. Email uses reserved .invalid domain.
  for (const [index, cpf] of ['52998224725', '11144477735', '01234567890'].entries()) {
    const name = ['Ana Exemplo', 'Bruno Demonstração', 'Carla Teste'][index]!;
    const value = `demo${index + 1}@example.invalid`;
    const lead = await db.lead.upsert({
      where: { cpfHash: crypto.hmac(cpf) },
      create: {
        name,
        cpfEncrypted: crypto.encrypt(cpf),
        cpfHash: crypto.hmac(cpf),
        cpfLast4: cpf.slice(-4),
        organization: 'Órgão Fictício',
        position: 'Demonstração',
        availableMargin: 500 + index * 100,
      },
      update: {},
    });
    const contact = await db.leadContact.upsert({
      where: {
        leadId_type_valueHash: { leadId: lead.id, type: 'EMAIL', valueHash: crypto.hmac(value) },
      },
      create: {
        leadId: lead.id,
        type: 'EMAIL',
        valueEncrypted: crypto.encrypt(value),
        valueHash: crypto.hmac(value),
        maskedValue: `de***@example.invalid`,
        isPrimary: true,
      },
      update: {},
    });
    if (!(await db.consent.count({ where: { contactId: contact.id } })))
      await db.consent.create({
        data: {
          leadId: lead.id,
          contactId: contact.id,
          channel: 'EMAIL',
          purpose: 'CREDIT_MARKETING',
          status: 'GRANTED',
          source: 'SYNTHETIC_DEMO',
          proof: { demo: true },
          grantedAt: new Date(),
        },
      });
  }
  const segment = await db.segment.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Base de demonstração',
      filters: { organization: 'Órgão Fictício' },
    },
    update: {},
  });
  const template = await db.messageTemplate.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Primeiro contato',
      channel: 'EMAIL',
      body: 'Olá, {{nome}}! Podemos encaminhar seu interesse para um atendente? Para sair, responda SAIR.',
    },
    update: {},
  });
  await db.campaign.upsert({
    where: { id: '00000000-0000-4000-8000-000000000003' },
    create: {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Campanha de demonstração',
      channel: 'EMAIL',
      segmentId: segment.id,
      templateId: template.id,
      allowedStartHour: 0,
      allowedEndHour: 24,
    },
    update: {},
  });

  await seedActivity(crypto, segment.id, admin.id);
}

// Populates a realistic 30-day analytics story (messages, recipients, conversations, opt-outs)
// so the dashboard is not empty in development. Runs once, guarded by the demo marker.
async function seedActivity(crypto: EncryptionService, segmentId: string, adminId: string) {
  if (await db.message.count({ where: { provider: DEMO_PROVIDER } })) return;

  const firstNames = ['Marina', 'João', 'Patrícia', 'Rafael', 'Beatriz', 'Diego', 'Larissa', 'Thiago', 'Camila', 'Gustavo', 'Fernanda', 'Rodrigo'];
  const lastNames = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Almeida', 'Costa', 'Gomes'];
  const orgs = ['Prefeitura Municipal', 'Governo do Estado', 'Tribunal de Justiça', 'Secretaria de Educação'];
  const positions = ['Analista', 'Técnico', 'Professor', 'Agente Administrativo'];

  // 36 synthetic demo leads with a phone contact and granted SMS consent.
  const people: Array<{ leadId: string; contactId: string }> = [];
  for (let i = 0; i < 36; i++) {
    const cpf = '9' + String(100000000 + i * 7).padStart(10, '0');
    const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
    const phone = '+5511' + String(900000000 + i * 137).padStart(9, '0');
    const lead = await db.lead.upsert({
      where: { cpfHash: crypto.hmac(cpf) },
      create: {
        name,
        cpfEncrypted: crypto.encrypt(cpf),
        cpfHash: crypto.hmac(cpf),
        cpfLast4: cpf.slice(-4),
        organization: orgs[i % orgs.length]!,
        position: positions[i % positions.length]!,
        employmentStatus: 'ATIVO',
        availableMargin: 300 + (i % 12) * 175,
        contractsCount: i % 4,
      },
      update: {},
    });
    const contact = await db.leadContact.upsert({
      where: {
        leadId_type_valueHash: { leadId: lead.id, type: 'PHONE', valueHash: crypto.hmac(phone) },
      },
      create: {
        leadId: lead.id,
        type: 'PHONE',
        valueEncrypted: crypto.encrypt(phone),
        valueHash: crypto.hmac(phone),
        maskedValue: `+5511*****${phone.slice(-2)}`,
        isPrimary: true,
      },
      update: {},
    });
    if (!(await db.consent.count({ where: { contactId: contact.id } })))
      await db.consent.create({
        data: {
          leadId: lead.id,
          contactId: contact.id,
          channel: 'SMS',
          purpose: 'CREDIT_MARKETING',
          status: 'GRANTED',
          source: 'SYNTHETIC_DEMO',
          proof: { demo: true },
          grantedAt: day(40),
        },
      });
    people.push({ leadId: lead.id, contactId: contact.id });
  }

  // Two extra demo campaigns (one completed, one running) so the list and funnel look alive.
  const smsTemplate = await db.messageTemplate.upsert({
    where: { id: '00000000-0000-4000-8000-000000000012' },
    create: {
      id: '00000000-0000-4000-8000-000000000012',
      name: 'Oferta consignado (SMS)',
      channel: 'SMS',
      body: 'Olá, {{nome}}! Você tem margem disponível. Quer simular? Responda SAIR para não receber.',
    },
    update: {},
  });
  const campaigns = [
    { id: '00000000-0000-4000-8000-000000000021', name: 'Servidores — margem livre', status: 'COMPLETED' as const, offset: 20 },
    { id: '00000000-0000-4000-8000-000000000022', name: 'Reengajamento — sem resposta', status: 'RUNNING' as const, offset: 6 },
  ];
  for (const c of campaigns) {
    await db.campaign.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        name: c.name,
        channel: 'SMS',
        segmentId,
        templateId: smsTemplate.id,
        status: c.status,
        hourlyLimit: 200,
        dailyLimit: 2000,
        allowedStartHour: 8,
        allowedEndHour: 20,
        requireConsent: true,
        preparedAt: day(c.offset + 1),
        approvedById: adminId,
        approvedAt: day(c.offset + 1),
        startAt: day(c.offset),
      },
      update: {},
    });
  }
  const mainCampaignId = campaigns[0]!.id;

  // A deterministic pseudo-random generator keeps the demo stable between runs.
  let s = 987654321;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;

  // 30 days of outbound activity with a realistic delivered / sent / failed mix and some replies.
  const messages: Array<{
    campaignId: string;
    contactId: string;
    provider: string;
    direction: 'OUTBOUND' | 'INBOUND';
    status: MessageStatus;
    body: string;
    createdAt: Date;
    sentAt: Date | null;
    deliveredAt: Date | null;
  }> = [];
  for (let d = 29; d >= 0; d--) {
    const base = 6 + Math.round((29 - d) * 0.7) + Math.floor(rand() * 6);
    for (let j = 0; j < base; j++) {
      const when = day(d);
      when.setHours(9 + Math.floor(rand() * 9), Math.floor(rand() * 60));
      const contactId = pick(people).contactId;
      const roll = rand();
      const status: MessageStatus = roll < 0.82 ? 'DELIVERED' : roll < 0.93 ? 'SENT' : 'FAILED';
      messages.push({
        campaignId: mainCampaignId,
        contactId,
        provider: DEMO_PROVIDER,
        direction: 'OUTBOUND',
        status,
        body: 'Olá! Você tem margem consignável disponível. Quer simular? Responda SAIR para não receber.',
        createdAt: when,
        sentAt: status === 'FAILED' ? null : when,
        deliveredAt: status === 'DELIVERED' ? when : null,
      });
      // ~12% of delivered messages get an inbound reply shortly after.
      if (status === 'DELIVERED' && rand() < 0.12) {
        const reply = new Date(when.getTime() + 3600000);
        messages.push({
          campaignId: mainCampaignId,
          contactId,
          provider: DEMO_PROVIDER,
          direction: 'INBOUND',
          status: 'RECEIVED',
          body: pick(['Tenho interesse, pode me ligar?', 'Quais as condições?', 'Não quero, obrigado']),
          createdAt: reply,
          sentAt: null,
          deliveredAt: null,
        });
      }
    }
  }
  // createMany is chunked to stay well within parameter limits.
  for (let i = 0; i < messages.length; i += 500)
    await db.message.createMany({ data: messages.slice(i, i + 500) });

  // Freeze recipients for the completed campaign so the audit trail is coherent.
  const statuses: RecipientStatus[] = ['DELIVERED', 'DELIVERED', 'DELIVERED', 'SENT', 'RESPONDED', 'FAILED'];
  await db.campaignRecipient.createMany({
    data: people.map((p, i) => ({
      campaignId: mainCampaignId,
      leadId: p.leadId,
      contactId: p.contactId,
      identityHash: crypto.hmac(`${mainCampaignId}:${p.contactId}`),
      status: statuses[i % statuses.length]!,
      queuedAt: day(20),
      sentAt: day(20),
      deliveredAt: statuses[i % statuses.length] === 'FAILED' ? null : day(20),
    })),
    skipDuplicates: true,
  });

  // A conversation funnel across the main statuses.
  const convoPlan: Array<[import('@prisma/client').ConversationStatus, number]> = [
    ['NEW', 4],
    ['INTERESTED', 3],
    ['QUALIFYING', 2],
    ['WAITING_HUMAN', 2],
    ['QUALIFIED', 1],
    ['NOT_INTERESTED', 2],
    ['OPT_OUT', 2],
    ['CLOSED', 2],
  ];
  let idx = 0;
  for (const [status, n] of convoPlan) {
    for (let k = 0; k < n && idx < people.length; k++, idx++) {
      const p = people[idx]!;
      const channel: Channel = 'SMS';
      const convo = await db.conversation.upsert({
        where: { contactId_channel: { contactId: p.contactId, channel } },
        create: {
          leadId: p.leadId,
          contactId: p.contactId,
          channel,
          status,
          lastMessageAt: day(Math.floor(rand() * 10)),
        },
        update: {},
      });
      if (status === 'OPT_OUT') {
        const lead = await db.lead.findUnique({ where: { id: p.leadId } });
        const contact = await db.leadContact.findUnique({ where: { id: p.contactId } });
        if (lead && contact) {
          const existing = await db.suppression.count({
            where: { identityHash: contact.valueHash, reason: 'OPT_OUT' },
          });
          if (!existing)
            await db.suppression.create({
              data: {
                leadId: lead.id,
                contactId: contact.id,
                identityHash: contact.valueHash,
                channel,
                reason: 'OPT_OUT',
                source: 'SYNTHETIC_DEMO',
                createdAt: day(Math.floor(rand() * 15)),
              },
            });
        }
      }
      void convo;
    }
  }
}

main().finally(() => db.$disconnect());
