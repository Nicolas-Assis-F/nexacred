import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { BaileysMessagingProvider, whatsappMessageId } from './baileys.provider.js';
const provider = new BaileysMessagingProvider('http://internal', 'test-key');
const input = {
  idempotencyKey: 'recipient-id',
  channel: 'WHATSAPP' as const,
  to: '+5562999998888',
  body: 'Olá, responda SAIR.',
};
afterEach(() => vi.unstubAllGlobals());
describe('Baileys provider', () => {
  it('routes only WhatsApp to the authenticated internal bridge', async () => {
    const fetch = vi.fn(async () => Response.json({ status: 'SENT' }));
    vi.stubGlobal('fetch', fetch);
    expect(await provider.send(input)).toMatchObject({
      status: 'SENT',
      providerMessageId: whatsappMessageId(input.idempotencyKey),
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://internal/dispatch',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer test-key' }),
      }),
    );
    expect((await provider.send({ ...input, channel: 'SMS' })).errorCode).toBe('CHANNEL_INVALID');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retries a pre-dispatch temporary failure but never an ambiguous timeout', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ code: 'NOT_CONNECTED' }, { status: 503 }));
    expect((await provider.send(input)).retryable).toBe(true);
    vi.stubGlobal('fetch', async () => {
      throw new Error('timeout');
    });
    expect(await provider.send(input)).toMatchObject({
      errorCode: 'RESULT_UNCERTAIN',
      retryable: false,
    });
  });
  it('rejects a modified or missing event signature', async () => {
    const payload = '[]',
      signature = createHmac('sha256', 'test-key').update(payload).digest('hex');
    expect(await provider.validateWebhook(payload, signature)).toBe(true);
    expect(await provider.validateWebhook('[1]', signature)).toBe(false);
    expect(await provider.validateWebhook(payload)).toBe(false);
  });
});
