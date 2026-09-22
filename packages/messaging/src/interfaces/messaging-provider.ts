export type ProviderMessageStatus = 'SENT' | 'DELIVERED' | 'FAILED' | 'INBOUND_REPLY';

export interface SendMessageInput {
  idempotencyKey: string;
  channel: 'SMS' | 'EMAIL';
  to: string;
  body: string;
  subject?: string;
  metadata?: Record<string, string>;
}

export interface SendMessageResult {
  providerMessageId: string;
  status: 'SENT' | 'FAILED';
  errorCode?: string;
  retryable?: boolean;
}

export interface ParsedWebhook {
  providerEventId: string;
  providerMessageId?: string;
  type: ProviderMessageStatus;
  from?: string;
  body?: string;
  occurredAt: Date;
  raw: unknown;
}

export interface MessagingProvider {
  readonly name: string;
  send(input: SendMessageInput): Promise<SendMessageResult>;
  parseWebhook(input: unknown): Promise<ParsedWebhook>;
  validateWebhook?(payload: unknown, signature?: string): Promise<boolean>;
}

export interface SmsMessagingProvider extends MessagingProvider { readonly channel: 'SMS'; }
export interface EmailMessagingProvider extends MessagingProvider { readonly channel: 'EMAIL'; }
