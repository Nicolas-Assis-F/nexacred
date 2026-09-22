import { describe, expect, it } from 'vitest';
import { MockMessagingProvider } from './mock.provider.js';

describe('MockMessagingProvider', () => {
  it('is idempotent by key', async () => {
    const provider = new MockMessagingProvider();
    const input = { idempotencyKey: 'same', channel: 'SMS' as const, to: '+5562999991234', body: 'Olá' };
    expect(await provider.send(input)).toEqual(await provider.send(input));
  });
  it('parses inbound replies', async () => {
    const provider = new MockMessagingProvider();
    const event = await provider.parseWebhook({ eventId: 'evt-1', type: 'INBOUND_REPLY', from: '+5562999991234', body: 'SAIR' });
    expect(event.type).toBe('INBOUND_REPLY');
  });
});
