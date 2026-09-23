import { ComplianceService } from '@nexacred/compliance';
import { PrismaClient, contactFacts, segmentWhere } from '@nexacred/database';
import { MockMessagingProvider, BaileysMessagingProvider } from '@nexacred/messaging';
import {
  EncryptionService,
  classify,
  botReplies,
  channelFor,
  contactTypeFor,
  segmentFiltersSchema,
} from '@nexacred/shared';
import { Job, Queue, Worker, DelayedError, UnrecoverableError } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { syncChatwoot } from './chatwoot.js';
import { ingestWhatsAppEvents } from './whatsapp-events.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const prisma = new PrismaClient();
const connection = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379', {
  maxRetriesPerRequest: null,
});
const queueOptions = { connection, prefix: process.env.QUEUE_PREFIX ?? 'bull' };
const sendQueue = new Queue('message-send', queueOptions);
const prepQueue = new Queue('campaign-preparation', queueOptions);
const hookQueue = new Queue('webhook-processing', queueOptions);
const crypto = new EncryptionService(
  process.env.PII_ENCRYPTION_KEY ?? '',
  process.env.PII_HMAC_SECRET ?? '',
);
const provider = new MockMessagingProvider(Number(process.env.MOCK_FAILURE_RATE ?? 0));
const bridgeUrl = process.env.WHATSAPP_LAB_URL ?? 'http://whatsapp-lab:3010';
const bridgeSecret = process.env.MOCK_WEBHOOK_SECRET ?? '';
const whatsapp = new BaileysMessagingProvider(bridgeUrl, bridgeSecret);
const gate = new ComplianceService();
const jobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: 1000,
};

async function prepare(job: Job<{ campaignId: string }>) {
  const c = await prisma.campaign.findUniqueOrThrow({
    where: { id: job.data.campaignId },
    include: { segment: true },
  });
  if (c.status !== 'RUNNING' || c.preparedAt) return;
  const filters = segmentFiltersSchema.parse(c.segment.filters);
  let cursor: string | undefined;
  while (true) {
    const leads = await prisma.lead.findMany({
      where: { ...segmentWhere(filters), createdAt: { lte: c.approvedAt ?? c.createdAt } },
      include: {
        contacts: { where: { type: contactTypeFor(c.channel) }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!leads.length) break;
    for (const lead of leads)
      for (const contact of lead.contacts) {
        const facts = await contactFacts(prisma, lead.id, contact.id, c.channel);
        const reasons = [
          ...(facts.suppressed ? ['SUPPRESSED'] : []),
          ...(!facts.hasConsent ? ['CONSENT_REQUIRED'] : []),
          ...(contact.status !== 'VALID' ? ['CONTACT_INVALID'] : []),
        ];
        await prisma.campaignRecipient.createMany({
          data: [
            {
              campaignId: c.id,
              leadId: lead.id,
              contactId: contact.id,
              identityHash: contact.valueHash,
              status: reasons.length ? 'SUPPRESSED' : 'QUEUED',
              reasons,
              queuedAt: new Date(),
            },
          ],
          skipDuplicates: true,
        });
      }
    cursor = leads[leads.length - 1]?.id;
  }
  await prisma.campaign.update({ where: { id: c.id }, data: { preparedAt: new Date() } });
  logger.info({ jobId: job.id, campaignId: c.id }, 'campaign materialized');
}

async function send(job: Job<{ recipientId?: string; messageId?: string }>, token?: string) {
  const outcome = await prisma.$transaction(
    async (tx) => {
      // Serializes quota decisions across all sender replicas and opt-out processing.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421)`;
      const recipient = job.data.recipientId
        ? await tx.campaignRecipient.findUniqueOrThrow({
            where: { id: job.data.recipientId },
            include: { campaign: { include: { template: true } } },
          })
        : null;
      if (recipient && !['QUEUED', 'PENDING'].includes(recipient.status)) return 'done';
      const existing = job.data.messageId
        ? await tx.message.findUniqueOrThrow({
            where: { id: job.data.messageId },
            include: { contact: true, conversation: true },
          })
        : null;
      if (existing && existing.status !== 'QUEUED') return 'done';
      if (!recipient && !existing) throw new UnrecoverableError('Missing message');
      const contactId = recipient?.contactId ?? existing!.contactId;
      const leadId = recipient?.leadId ?? existing!.contact.leadId;
      const channel =
        recipient?.campaign.channel ??
        existing?.conversation?.channel ??
        channelFor(existing!.contact.type);
      const transport = channel === 'WHATSAPP' ? whatsapp : provider;
      const facts = await contactFacts(tx, leadId, contactId, channel);
      const campaign = recipient?.campaign ?? {
        id: 'service',
        status: 'RUNNING',
        requireConsent: true,
        allowedStartHour: 0,
        allowedEndHour: 24,
        hourlyLimit: 20,
        dailyLimit: 100,
        startAt: null,
        endAt: null,
      };
      const now = new Date();
      const sinceHour = new Date(now.getTime() - 3600000);
      const sinceDay = new Date(now.getTime() - 86400000);
      const scope = recipient ? { campaignId: recipient.campaignId } : { contactId };
      const [hourly, daily, recent] = await Promise.all([
        tx.message.count({
          where: { ...scope, direction: 'OUTBOUND', sentAt: { gte: sinceHour } },
        }),
        tx.message.count({ where: { ...scope, direction: 'OUTBOUND', sentAt: { gte: sinceDay } } }),
        recipient
          ? tx.message.count({
              where: {
                contact: { valueHash: facts.contact.valueHash },
                direction: 'OUTBOUND',
                campaignId: { not: recipient.campaignId },
                sentAt: {
                  gte: new Date(
                    now.getTime() - Number(process.env.CONTACT_FREQUENCY_HOURS ?? 24) * 3600000,
                  ),
                },
              },
            })
          : Promise.resolve(0),
      ]);
      const result = gate.canSend({
        lead: facts.lead,
        contact: facts.contact,
        campaign,
        facts: {
          suppressed: facts.suppressed,
          hasConsent: facts.hasConsent,
          alreadyRecipient: false,
          duplicateContact: false,
          sentLastHour: hourly,
          sentToday: daily,
          previousSuccessfulSend: false,
          recentContact: recent > 0,
        },
      });
      if (!result.allowed) {
        const permanent =
          result.reasons.some((x) =>
            [
              'SUPPRESSED',
              'CONSENT_REQUIRED',
              'LEAD_INACTIVE',
              'CONTACT_INVALID',
              'CAMPAIGN_ENDED',
            ].includes(x),
          ) || campaign.status === 'CANCELLED';
        if (!permanent) return 'delay';
        if (recipient)
          await tx.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SUPPRESSED', reasons: result.reasons },
          });
        if (existing)
          await tx.message.update({
            where: { id: existing.id },
            data: { status: 'FAILED', errorCode: result.reasons.join(',') },
          });
        return 'done';
      }
      const conversation = await tx.conversation.upsert({
        where: { contactId_channel: { contactId, channel } },
        create: { leadId, contactId, channel },
        update: {},
      });
      let message =
        existing ??
        (await tx.message.findFirst({
          where: { campaignRecipientId: recipient!.id, direction: 'OUTBOUND' },
        }));
      if (message && ['SENT', 'DELIVERED'].includes(message.status)) return 'done';
      message =
        message ??
        (await tx.message.create({
          data: {
            campaignId: recipient!.campaignId,
            campaignRecipientId: recipient!.id,
            contactId,
            conversationId: conversation.id,
            provider: transport.name,
            metadata: { chatwootPending: true },
            direction: 'OUTBOUND',
            status: 'QUEUED',
            body: recipient!.campaign.template.body.replace(/{{\s*nome\s*}}/gi, facts.lead.name),
          },
        }));
      const body =
        channel === 'WHATSAPP' && !/\bSAIR\b/i.test(message.body)
          ? message.body + '\n\nPara não receber mais mensagens, responda SAIR.'
          : message.body;
      // Recheck time-dependent policy immediately before the transport call. Consent/suppressions
      // are protected by the same database lock held above, including manual replies.
      const finalGate = gate.canSend({
        lead: facts.lead,
        contact: facts.contact,
        campaign,
        facts: {
          suppressed: facts.suppressed,
          hasConsent: facts.hasConsent,
          alreadyRecipient: false,
          duplicateContact: false,
          sentLastHour: hourly,
          sentToday: daily,
          previousSuccessfulSend: false,
          recentContact: recent > 0,
        },
      });
      if (!finalGate.allowed) return 'delay';
      const sent = await transport.send({
        idempotencyKey: recipient?.id ?? message.id,
        channel,
        to: crypto.decrypt(facts.contact.valueEncrypted),
        body,
        ...(recipient ? {metadata:{campaignId:recipient.campaignId}} : {}),
      });
      if (sent.retryable && ['NOT_CONNECTED', 'RATE_LIMIT'].includes(sent.errorCode ?? ''))
        return 'delay';
      if (sent.status === 'FAILED' && sent.retryable) throw new Error('PROVIDER_TRANSIENT');
      await tx.message.update({
        where: { id: message.id },
        data: {
          provider: transport.name,
          body,
          providerMessageId: sent.providerMessageId,
          status: sent.status,
          sentAt: sent.status === 'SENT' ? now : null,
          errorCode: sent.errorCode ?? null,
          conversationId: conversation.id,
        },
      });
      if (recipient)
        await tx.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: sent.status,
            sentAt: sent.status === 'SENT' ? now : null,
            failedAt: sent.status === 'FAILED' ? now : null,
          },
        });
      await tx.auditLog.create({
        data: {
          action: sent.status === 'SENT' ? 'MESSAGE_SENT' : 'MESSAGE_FAILED',
          entityType: 'Message',
          entityId: message.id,
          metadata: { provider: transport.name, errorCode: sent.errorCode ?? null },
        },
      });
      if (sent.status === 'SENT' && transport.name === 'mock')
        await tx.webhookEvent.upsert({
          where: {
            provider_providerEventId: {
              provider: 'mock',
              providerEventId: `delivery-${message.id}`,
            },
          },
          create: {
            provider: 'mock',
            providerEventId: `delivery-${message.id}`,
            eventType: 'DELIVERED',
            payload: {
              eventId: `delivery-${message.id}`,
              type: 'DELIVERED',
              messageId: sent.providerMessageId,
            },
          },
          update: {},
        });
      return 'done';
    },
    { timeout: 20000, maxWait: 30000 },
  );
  if (outcome === 'delay') {
    await job.moveToDelayed(Date.now() + 60000, token);
    throw new DelayedError();
  }
  logger.info({ jobId: job.id }, 'send processed');
}

async function webhook(job: Job<{ webhookEventId: string }>) {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421)`;
      const event = await tx.webhookEvent.findUniqueOrThrow({
        where: { id: job.data.webhookEventId },
      });
      if (event.processed) return;
      // Raw payload is encrypted at ingress; synthetic delivery events contain no PII.
      const value = event.payload as Record<string, unknown>;
      const raw =
        typeof value.encrypted === 'string'
          ? (JSON.parse(crypto.decrypt(value.encrypted)) as unknown)
          : event.payload;
      const parsed = await (event.provider === 'baileys' ? whatsapp : provider).parseWebhook(raw);
      if (parsed.type === 'INBOUND_REPLY') {
        const contactId =
          event.provider === 'baileys'
            ? (
                await tx.leadContact.findFirst({
                  where: { type: 'PHONE', valueHash: crypto.hmac(parsed.from!) },
                  orderBy: { createdAt: 'asc' },
                })
              )?.id
            : (raw as { contactId?: string }).contactId;
        if (!contactId) {
          if (event.provider !== 'baileys')
            throw new UnrecoverableError('Inbound requires resolved contact');
          if (classify(parsed.body!) === 'OPT_OUT') {
            const identityHash = crypto.hmac(parsed.from!);
            if (!(await tx.suppression.findFirst({ where: { identityHash, active: true } })))
              await tx.suppression.create({
                data: { identityHash, reason: 'OPT_OUT', source: 'WHATSAPP_INBOUND' },
              });
          }
          await tx.webhookEvent.update({
            where: { id: event.id },
            data: { processed: true, processedAt: new Date() },
          });
          return;
        }
        const contact = await tx.leadContact.findUniqueOrThrow({
          where: { id: contactId },
          include: { lead: true },
        });
        const status = classify(parsed.body!);
        const channel = event.provider === 'baileys' ? 'WHATSAPP' : channelFor(contact.type);
        const conversation = await tx.conversation.upsert({
          where: { contactId_channel: { contactId, channel } },
          create: { contactId, leadId: contact.leadId, channel, status, lastMessageAt: new Date() },
          update: { status, lastMessageAt: new Date() },
        });
        await tx.message.create({
          data: {
            contactId,
            conversationId: conversation.id,
            provider: event.provider,
            providerMessageId: `in-${event.id}`,
            metadata: { chatwootPending: true },
            direction: 'INBOUND',
            status: 'RECEIVED',
            body: parsed.body!,
          },
        });
        await tx.campaignRecipient.updateMany({
          where: { contactId, status: { in: ['SENT', 'DELIVERED'] } },
          data: { status: 'RESPONDED', respondedAt: new Date() },
        });
        if (status === 'OPT_OUT') {
          // Block the person and the shared contact, so re-import cannot restore eligibility.
          for (const identityHash of [contact.valueHash, contact.lead.cpfHash])
            if (!(await tx.suppression.findFirst({ where: { identityHash, active: true } })))
              await tx.suppression.create({
                data: {
                  leadId: contact.leadId,
                  contactId,
                  identityHash,
                  reason: 'OPT_OUT',
                  source: 'INBOUND_MESSAGE',
                },
              });
          await tx.consent.updateMany({
            where: { leadId: contact.leadId },
            data: { status: 'REVOKED', revokedAt: new Date() },
          });
          await tx.auditLog.create({
            data: { action: 'OPT_OUT', entityType: 'Lead', entityId: contact.leadId },
          });
        }
        // Persist the deterministic recommendation as a note. All actual replies use the gated sender.
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { note: botReplies[status] },
        });
      } else {
        const message = await tx.message.findUnique({
          where: { providerMessageId: parsed.providerMessageId! },
        });
        if (!message) throw new Error('Awaiting original message');
        // Late SENT/FAILED events never downgrade a delivered message.
        if (
          message.status !== 'DELIVERED' &&
          (parsed.type === 'DELIVERED' || message.status !== 'SENT')
        ) {
          const status = parsed.type;
          await tx.message.update({
            where: { id: message.id },
            data: { status, deliveredAt: status === 'DELIVERED' ? new Date() : null },
          });
          if (message.campaignRecipientId)
            await tx.campaignRecipient.updateMany({
              where: {
                id: message.campaignRecipientId,
                status: { notIn: ['RESPONDED', 'CANCELLED', 'SUPPRESSED'] },
              },
              data: { status, deliveredAt: status === 'DELIVERED' ? new Date() : null },
            });
        }
      }
      await tx.webhookEvent.update({
        where: { id: event.id },
        data: { processed: true, processedAt: new Date() },
      });
    },
    { timeout: 20000, maxWait: 30000 },
  );
}

let reconciling = false;
async function reconcile() {
  if (reconciling) return;
  reconciling = true;
  try {
    if (process.env.WHATSAPP_LAB_ENABLED === 'true')
      await ingestWhatsAppEvents(prisma, crypto, whatsapp, bridgeUrl, bridgeSecret).catch(() =>
        logger.warn('WhatsApp events unavailable; will retry'),
      );
    for (const c of await prisma.campaign.findMany({
      where: { status: 'RUNNING', preparedAt: null },
      take: 100,
    }))
      await prepQueue.add(
        'prepare',
        { campaignId: c.id },
        { ...jobOptions, jobId: `prepare-${c.id}` },
      );
    for (const r of await prisma.campaignRecipient.findMany({
      where: { status: 'QUEUED', campaign: { status: 'RUNNING', preparedAt: { not: null } } },
      take: 1000,
      orderBy: { updatedAt: 'asc' },
    })) {
      await sendQueue.add(
        'send',
        { recipientId: r.id },
        { ...jobOptions, jobId: `recipient-${r.id}` },
      );
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { updatedAt: new Date() },
      });
    }
    for (const m of await prisma.message.findMany({
      where: { status: 'QUEUED', campaignRecipientId: null },
      take: 500,
    }))
      await sendQueue.add('send', { messageId: m.id }, { ...jobOptions, jobId: `message-${m.id}` });
    for (const e of await prisma.webhookEvent.findMany({
      where: { processed: false },
      take: 500,
      orderBy: { createdAt: 'asc' },
    }))
      await hookQueue.add(
        'webhook',
        { webhookEventId: e.id },
        { ...jobOptions, jobId: `webhook-${e.id}` },
      );
    const active = await prisma.campaign.findMany({
      where: { status: 'RUNNING', preparedAt: { not: null } },
      select: { id: true },
    });
    for (const c of active)
      if (
        !(await prisma.campaignRecipient.count({
          where: { campaignId: c.id, status: { in: ['PENDING', 'QUEUED'] } },
        }))
      )
        await prisma.campaign.updateMany({
          where: { id: c.id, status: 'RUNNING' },
          data: { status: 'COMPLETED' },
        });
    if (process.env.CHATWOOT_ENABLED === 'true') await syncChatwoot(prisma);
  } catch {
    logger.error('Reconciliation failed; will retry');
  } finally {
    reconciling = false;
  }
}
const workers = [
  new Worker('campaign-preparation', prepare, { ...queueOptions, concurrency: 1 }),
  new Worker('message-send', send, {
    ...queueOptions,
    concurrency: 1,
    limiter: { max: 100, duration: 60000 },
  }),
  new Worker('webhook-processing', webhook, { ...queueOptions, concurrency: 1 }),
];
for (const worker of workers) {
  worker.on('error', () => logger.error({ queue: worker.name }, 'worker error'));
  worker.on('failed', (job) => {
    logger.error({ jobId: job?.id, queue: worker.name }, 'job failed');
    if (job && worker.name === 'message-send' && job.attemptsMade >= 5) {
      void prisma
        .$transaction(async (tx) => {
          if ('recipientId' in job.data && job.data.recipientId)
            await tx.campaignRecipient.updateMany({
              where: { id: job.data.recipientId, status: 'QUEUED' },
              data: { status: 'FAILED', failedAt: new Date(), reasons: ['RETRIES_EXHAUSTED'] },
            });
          if ('messageId' in job.data && job.data.messageId)
            await tx.message.updateMany({
              where: { id: job.data.messageId, status: 'QUEUED' },
              data: { status: 'FAILED', errorCode: 'RETRIES_EXHAUSTED' },
            });
        })
        .catch(() => logger.error('failed state update'));
    }
  });
}
const interval = setInterval(() => void reconcile(), 3000);
void reconcile();
logger.info('NexaCred workers started (WhatsApp + simulation)');
async function shutdown() {
  clearInterval(interval);
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all([sendQueue.close(), prepQueue.close(), hookQueue.close()]);
  await connection.quit();
  await prisma.$disconnect();
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
