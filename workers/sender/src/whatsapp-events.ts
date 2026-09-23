import type { PrismaClient } from '@nexacred/database';
import { BaileysMessagingProvider } from '@nexacred/messaging';
import type { EncryptionService } from '@nexacred/shared';
/** Persist before ACK: bridge outbox + DB unique constraint survive either process restarting. */
export async function ingestWhatsAppEvents(
  prisma: PrismaClient,
  crypto: EncryptionService,
  provider: BaileysMessagingProvider,
  url: string,
  secret: string,
) {
  const headers = { authorization: `Bearer ${secret}`, 'content-type': 'application/json' };
  const response = await fetch(`${url}/events`, { headers, signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('BRIDGE_UNAVAILABLE');
  const envelope = (await response.json()) as { payload: string; signature: string };
  if (!(await provider.validateWebhook(envelope.payload, envelope.signature)))
    throw new Error('BRIDGE_SIGNATURE_INVALID');
  const events = JSON.parse(envelope.payload) as Array<{ id: string; encrypted: string }>;
  for (const event of events) {
    const raw: unknown = JSON.parse(crypto.decrypt(event.encrypted));
    const parsed = await provider.parseWebhook(raw);
    if (parsed.providerEventId !== event.id) throw new Error('EVENT_ID_MISMATCH');
    await prisma.webhookEvent.upsert({
      where: { provider_providerEventId: { provider: 'baileys', providerEventId: event.id } },
      create: {
        provider: 'baileys',
        providerEventId: event.id,
        eventType: parsed.type,
        payload: { encrypted: event.encrypted },
      },
      update: {},
    });
  }
  if (events.length) {
    const ack = await fetch(`${url}/events/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: events.map((e) => e.id) }),
      signal: AbortSignal.timeout(4000),
    });
    if (!ack.ok) throw new Error('BRIDGE_ACK_FAILED');
  }
}
