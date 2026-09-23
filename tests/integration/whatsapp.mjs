// Run inside the node image with the entrypoint's environment (see docs/validation.md).
// Uses an isolated PostgreSQL schema + Redis prefix. No real WhatsApp connection or send.
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const { PrismaClient } = await import('/app/packages/database/dist/index.js');
const { EncryptionService } = await import('/app/packages/shared/dist/index.js');
const { whatsappMessageId } = await import('/app/packages/messaging/dist/index.js');
const { Queue } = await import('/app/workers/sender/node_modules/bullmq/dist/cjs/index.js');
const { default: Redis } = await import('/app/workers/sender/node_modules/ioredis/built/index.js');
const suffix = randomUUID().replaceAll('-', '');
const schema = `whatsapp_test_${suffix}`;
const url = new URL(process.env.DATABASE_URL); url.searchParams.set('schema', schema);
const environment = { ...process.env, DATABASE_URL: url.toString(), QUEUE_PREFIX: `test-${suffix}`, WHATSAPP_LAB_ENABLED: 'true', WHATSAPP_LAB_URL: 'http://127.0.0.1:3099', CHATWOOT_ENABLED: 'false' };
const db = new PrismaClient({ datasourceUrl: url.toString() });
const crypto = new EncryptionService(process.env.PII_ENCRYPTION_KEY, process.env.PII_HMAC_SECRET);
const secret = process.env.MOCK_WEBHOOK_SECRET;
const deliveries = new Map(), events = [];
let mode = 'connected', dispatchCalls = 0;
const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.headers.authorization !== `Bearer ${secret}`) { res.writeHead(401); res.end('{}'); return; }
  let text = ''; for await (const chunk of req) text += chunk;
  const body = JSON.parse(text || '{}');
  if (req.url === '/dispatch') {
    dispatchCalls++;
    if (mode === 'disconnected') { res.writeHead(503); res.end('{"code":"NOT_CONNECTED"}'); return; }
    deliveries.set(body.id, body);
    res.end('{"status":"SENT"}'); return;
  }
  if (req.url === '/events') {
    const payload = JSON.stringify(events);
    res.end(JSON.stringify({ payload, signature: createHmac('sha256', secret).update(payload).digest('hex') })); return;
  }
  if (req.url === '/events/ack') {
    for (let i = events.length - 1; i >= 0; i--) if (body.ids.includes(events[i].id)) events.splice(i, 1);
    res.end('{}'); return;
  }
  res.writeHead(404); res.end('{}');
});
let worker;
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const queues = ['message-send', 'campaign-preparation', 'webhook-processing'].map(name => new Queue(name, { connection: redis, prefix: environment.QUEUE_PREFIX }));
async function until(read, predicate, label, ms = 35000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await read(); if (predicate(value)) return value; await new Promise(r => setTimeout(r, 250)); }
  throw new Error('Timed out: ' + label);
}
function event(raw) { events.push({ id: raw.eventId, encrypted: crypto.encrypt(JSON.stringify(raw)) }); }
try {
  execFileSync('pnpm', ['--filter', '@nexacred/database', 'db:deploy'], { cwd: '/app', env: environment, stdio: 'pipe' });
  await new Promise(r => server.listen(3099, '127.0.0.1', r));
  const lead = await db.lead.create({ data: { name: 'Pessoa Sintética', cpfEncrypted: crypto.encrypt('SYNTHETIC'), cpfHash: crypto.hmac('test-cpf'), cpfLast4: '0000', organization: 'Integration Test' } });
  const phone = '+5562999998888';
  const contact = await db.leadContact.create({ data: { leadId: lead.id, type: 'PHONE', valueEncrypted: crypto.encrypt(phone), valueHash: crypto.hmac(phone), maskedValue: '+5562*****88' } });
  const segment = await db.segment.create({ data: { name: 'Test', filters: { organization: 'Integration Test' } } });
  const template = await db.messageTemplate.create({ data: { name: 'Test', channel: 'WHATSAPP', body: 'Olá {{nome}}. Teste autorizado.' } });
  async function campaign(name, extra = {}) { return db.campaign.create({ data: { name, channel: 'WHATSAPP', templateId: template.id, segmentId: segment.id, hourlyLimit: 5, dailyLimit: 20, status: 'RUNNING', allowedStartHour: 0, allowedEndHour: 24, approvedAt: new Date(), ...extra } }); }
  worker = spawn('node', ['/app/workers/sender/dist/index.js'], { cwd: '/app/workers/sender', env: environment, stdio: 'ignore' });
  const noConsent = await campaign('Consent required');
  await until(() => db.campaignRecipient.findFirst({ where: { campaignId: noConsent.id } }), r => r?.status === 'SUPPRESSED', 'consent suppression');
  assert.equal(deliveries.size, 0);
  await db.consent.create({ data: { leadId: lead.id, contactId: contact.id, channel: 'WHATSAPP', status: 'GRANTED', purpose: 'CREDIT_MARKETING', source: 'AUTOMATED_TEST', proof: { reference: 'Synthetic test only' }, grantedAt: new Date() } });
  mode = 'disconnected';
  const c = await campaign('Send when connected');
  const recipient = await until(() => db.campaignRecipient.findFirst({ where: { campaignId: c.id } }), r => !!r, 'recipient');
  await until(() => Promise.resolve(dispatchCalls), n => n > 0, 'disconnected bridge');
  assert.equal((await db.campaignRecipient.findUnique({ where: { id: recipient.id } })).status, 'QUEUED');
  assert.equal(deliveries.size, 0);
  mode = 'connected';
  const delayed = await queues[0].getJob(`recipient-${recipient.id}`);
  await until(() => delayed.getState(), s => s === 'delayed', 'retry delay');
  await delayed.promote();
  const sent = await until(() => db.message.findFirst({ where: { campaignRecipientId: recipient.id } }), m => m?.status === 'SENT', 'real provider routing');
  assert.equal(sent.provider, 'baileys'); assert.match(sent.body, /SAIR/);
  assert.equal(deliveries.size, 1); assert.ok(deliveries.has(recipient.id));
  await queues[0].add('duplicate', { recipientId: recipient.id }, { jobId: 'explicit-duplicate' });
  await new Promise(r => setTimeout(r, 1000)); assert.equal(deliveries.size, 1);
  const delivery = { eventId: 'delivery-test', type: 'DELIVERED', messageId: whatsappMessageId(recipient.id) };
  event(delivery); event(delivery);
  await until(() => db.message.findUnique({ where: { id: sent.id } }), m => m.status === 'DELIVERED', 'delivery receipt');
  assert.equal(await db.webhookEvent.count({ where: { providerEventId: 'delivery-test' } }), 1);
  const frequency = await campaign('Frequency protection');
  const frequencyRecipient = await until(() => db.campaignRecipient.findFirst({ where: { campaignId: frequency.id } }), r => !!r, 'frequency recipient');
  await new Promise(r => setTimeout(r, 4000));
  assert.equal((await db.campaignRecipient.findUnique({ where: { id: frequencyRecipient.id } })).status, 'QUEUED'); assert.equal(deliveries.size, 1);
  await db.campaign.update({ where: { id: frequency.id }, data: { status: 'PAUSED' } });
  await queues[0].add('paused', { recipientId: frequencyRecipient.id }, { jobId: 'paused-test' });
  await new Promise(r => setTimeout(r, 1000)); assert.equal(deliveries.size, 1);
  event({ eventId: 'opt-out-test', type: 'INBOUND_REPLY', from: phone, body: 'SAIR' });
  await until(() => db.suppression.count({ where: { identityHash: contact.valueHash, active: true } }), n => n === 1, 'global opt-out');
  const conversation = await db.conversation.findFirst({ where: { contactId: contact.id, channel: 'WHATSAPP' } });
  assert.equal(conversation.status, 'OPT_OUT');
  const manual = await db.message.create({ data: { contactId: contact.id, conversationId: conversation.id, provider: 'baileys', direction: 'OUTBOUND', status: 'QUEUED', body: 'Must not send' } });
  await until(() => db.message.findUnique({ where: { id: manual.id } }), m => m.status === 'FAILED', 'manual opt-out gate');
  assert.equal(deliveries.size, 1);
  const blockedCampaign = await campaign('After opt-out');
  await until(() => db.campaignRecipient.findFirst({ where: { campaignId: blockedCampaign.id } }), r => r?.status === 'SUPPRESSED', 'campaign opt-out gate');
  assert.equal(await db.auditLog.count({ where: { action: 'MESSAGE_SENT' } }), 1);
  console.log('PASS: WhatsApp worker integration — consent, disconnected delay, provider routing, stable IDs, delivery deduplication, frequency, pause, inbound opt-out, manual gate and audit.');
} finally {
  if (worker) { worker.kill('SIGTERM'); await new Promise(r => { worker.once('exit', r); setTimeout(r, 5000); }); }
  for (const queue of queues) { await queue.obliterate({ force: true }); await queue.close(); }
  await redis.quit();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.$disconnect();
  await new Promise(r => server.close(r));
}
