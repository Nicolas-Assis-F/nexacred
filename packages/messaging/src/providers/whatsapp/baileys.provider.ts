import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  MessagingProvider,
  ParsedWebhook,
  SendMessageInput,
  SendMessageResult,
} from '../../interfaces/messaging-provider.js';
import { MockMessagingProvider } from '../mock/mock.provider.js';

export function whatsappMessageId(key: string): string {
  return 'NEXA' + createHash('sha256').update(key).digest('hex').slice(0, 28).toUpperCase();
}
/** Internal authenticated bridge; callers must evaluate ComplianceService before send. */
export class BaileysMessagingProvider implements MessagingProvider {
  readonly name = 'baileys';
  constructor(
    private readonly url: string,
    private readonly secret: string,
  ) {}
  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const providerMessageId = whatsappMessageId(input.idempotencyKey);
    if (input.channel !== 'WHATSAPP')
      return {
        providerMessageId,
        status: 'FAILED',
        errorCode: 'CHANNEL_INVALID',
        retryable: false,
      };
    try {
      const response = await fetch(`${this.url}/dispatch`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.secret}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          id: input.idempotencyKey,
          phone: input.to,
          message: input.body,
          consent: true,
          ...(input.metadata?.campaignId ? {campaignId:input.metadata.campaignId} : {}),
        }),
        signal: AbortSignal.timeout(12000),
      });
      const value = (await response.json()) as { status?: string; code?: string };
      if (!response.ok) {
        const code = value.code ?? 'BRIDGE_REJECTED';
        return {
          providerMessageId,
          status: 'FAILED',
          errorCode: code,
          retryable: ['NOT_CONNECTED', 'RATE_LIMIT', 'LOOKUP_UNAVAILABLE'].includes(code),
        };
      }
      if (['SENT', 'DELIVERED', 'READ'].includes(value.status ?? ''))
        return { providerMessageId, status: 'SENT' };
      return {
        providerMessageId,
        status: 'FAILED',
        errorCode: 'RESULT_UNCERTAIN',
        retryable: false,
      };
    } catch {
      // A timeout may happen after WhatsApp accepted the message. Never retry blindly.
      return {
        providerMessageId,
        status: 'FAILED',
        errorCode: 'RESULT_UNCERTAIN',
        retryable: false,
      };
    }
  }
  parseWebhook(input: unknown): Promise<ParsedWebhook> {
    return new MockMessagingProvider().parseWebhook(input);
  }
  async validateWebhook(payload: unknown, signature?: string): Promise<boolean> {
    if (typeof payload !== 'string' || !signature || !/^[a-f0-9]{64}$/.test(signature))
      return false;
    const expected = createHmac('sha256', this.secret).update(payload).digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }
}
