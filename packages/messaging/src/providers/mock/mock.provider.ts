import { createHash } from 'node:crypto';
import type { MessagingProvider, ParsedWebhook, SendMessageInput, SendMessageResult } from '../../interfaces/messaging-provider.js';
export class MockMessagingProvider implements MessagingProvider {
  readonly name = 'mock';
  constructor(private readonly failureRate = 0) {}
  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const providerMessageId = 'mock_' + createHash('sha256').update(input.idempotencyKey).digest('hex');
    if (Math.random() < this.failureRate) return {providerMessageId,status:'FAILED',errorCode:'MOCK_TRANSIENT',retryable:true};
    return {providerMessageId,status:'SENT'};
  }
  async parseWebhook(input: unknown): Promise<ParsedWebhook> {
    if (!input || typeof input !== 'object') throw new Error('Invalid event');
    const v = input as Record<string, unknown>;
    if (typeof v.eventId !== 'string' || !v.eventId || typeof v.type !== 'string' || !['SENT','DELIVERED','FAILED','INBOUND_REPLY'].includes(v.type)) throw new Error('Invalid event');
    if (v.type === 'INBOUND_REPLY' && (typeof v.from !== 'string' || typeof v.body !== 'string' || !v.body || v.body.length > 4000)) throw new Error('Invalid inbound');
    if (v.type !== 'INBOUND_REPLY' && typeof v.messageId !== 'string') throw new Error('Missing messageId');
    const occurredAt = typeof v.occurredAt === 'string' ? new Date(v.occurredAt) : new Date();
    if (!Number.isFinite(occurredAt.getTime())) throw new Error('Invalid timestamp');
    return {providerEventId:v.eventId,type:v.type as ParsedWebhook['type'],occurredAt,raw:input,...(typeof v.messageId === 'string' ? {providerMessageId:v.messageId}:{}),...(typeof v.from === 'string'?{from:v.from}:{}),...(typeof v.body === 'string'?{body:v.body}:{})};
  }
}
