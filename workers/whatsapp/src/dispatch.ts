import { createHash } from 'node:crypto';
import { ComplianceService } from '@nexacred/compliance';
import { normalizeBrazilianPhone } from '@nexacred/shared';
export class DispatchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export type Attempt = {
  id: string;
  targetHash: string;
  target: string;
  at: number;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'UNCERTAIN';
  providerId?: string;
  fingerprint?: string;
  bodyEncrypted?: string;
  phoneEncrypted?: string;
  jidHash?: string;
  kind?: 'TEST' | 'CAMPAIGN';
  campaignId?: string;
};
export type DispatchDependencies = {
  attempts: Attempt[];
  enabled: boolean;
  connected: () => boolean;
  suppressed: (hash: string) => boolean;
  hash: (value: string) => string;
  encrypt: (value: string) => string;
  persist: () => Promise<void>;
  resolve: (phone: string) => Promise<string | undefined>;
  send: (jid: string, text: string, id: string) => Promise<void>;
};
export function buildMessage(custom: unknown, max = 700): string {
  if (typeof custom !== 'string' || !custom.trim() || custom.length > max)
    throw new DispatchError('MESSAGE_INVALID', `Escreva uma mensagem de até ${max} caracteres.`);
  const text = [...custom]
    .filter((c) => (c.codePointAt(0) ?? 0) >= 32 || '\n\r\t'.includes(c))
    .join('')
    .trim();
  if (!text) throw new DispatchError('MESSAGE_INVALID', 'Escreva uma mensagem.');
  return /\bSAIR\b/i.test(text)
    ? text
    : `${text}\n\nPara não receber mais mensagens, responda SAIR.`;
}
/** Must be called under the bridge's serialized queue. The ledger survives process restarts. */
export async function dispatch(
  input: Record<string, unknown>,
  kind: 'TEST' | 'CAMPAIGN',
  deps: DispatchDependencies,
): Promise<Attempt> {
  if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id))
    throw new DispatchError('ID_INVALID', 'Identificador inválido.');
  const phone = typeof input.phone === 'string' ? normalizeBrazilianPhone(input.phone) : null;
  if (!phone)
    throw new DispatchError('PHONE_INVALID', 'Informe um telefone brasileiro válido com DDD.');
  const text = buildMessage(input.message, kind === 'TEST' ? 700 : 4000);
  const fingerprint = deps.hash(JSON.stringify([phone, text, kind]));
  const previous = deps.attempts.find((a) => a.id === input.id);
  if (previous) {
    if (previous.fingerprint && previous.fingerprint !== fingerprint)
      throw new DispatchError('ID_CONFLICT', 'Esta tentativa já está vinculada a outra mensagem.');
    return previous;
  }
  if (!deps.enabled || !deps.connected())
    throw new DispatchError('NOT_CONNECTED', 'Conecte o WhatsApp antes de enviar.');
  if (input.consent !== true)
    throw new DispatchError('CONSENT_REQUIRED', 'Confirme a autorização do destinatário.');
  let jid: string | undefined;
  try {
    jid = await deps.resolve(phone);
  } catch {
    throw new DispatchError(
      'LOOKUP_UNAVAILABLE',
      'Não foi possível verificar o destinatário. Tente novamente.',
    );
  }
  if (!jid)
    throw new DispatchError(
      'NOT_ON_WHATSAPP',
      'Este telefone não foi encontrado no WhatsApp. Verifique o DDD e o número.',
    );
  const targetHash = deps.hash(phone),
    jidHash = deps.hash('+' + jid.split('@')[0]!.split(':')[0]!);
  const now = Date.now();
  const recent = deps.attempts;
  if (recent.filter(a => a.at > now - 3600000).length >= 20 || recent.filter(a => a.at > now - 86400000).length >= 100)
    throw new DispatchError('RATE_LIMIT', 'Limite global do WhatsApp atingido. Aguarde a próxima janela.');
  if (typeof input.campaignId === 'string' && recent.some(a => a.campaignId === input.campaignId && a.jidHash === jidHash))
    throw new DispatchError('DUPLICATE_CONTACT', 'Este destinatário já foi processado nesta campanha.');
  const quota = kind === 'TEST' ? recent.filter((a) => a.kind !== 'CAMPAIGN') : recent;
  const result = new ComplianceService().canSend({
    lead: { id: 'bridge', status: 'ACTIVE' },
    contact: { id: 'bridge', status: 'VALID', valueHash: targetHash },
    campaign: {
      id: 'bridge',
      status: 'RUNNING',
      requireConsent: true,
      allowedStartHour: 0,
      allowedEndHour: 24,
      hourlyLimit: kind === 'TEST' ? 5 : 20,
      dailyLimit: kind === 'TEST' ? 20 : 100,
    },
    facts: {
      suppressed: deps.suppressed(targetHash) || deps.suppressed(jidHash),
      hasConsent: input.consent === true,
      alreadyRecipient: false,
      duplicateContact: false,
      previousSuccessfulSend: false,
      sentLastHour: quota.filter((a) => a.at > now - 3600000).length,
      sentToday: quota.filter((a) => a.at > now - 86400000).length,
    },
  });
  if (!result.allowed)
    throw new DispatchError(
      result.reasons.includes('SUPPRESSED') ? 'SUPPRESSED' : 'RATE_LIMIT',
      'Envio bloqueado: ' + result.reasons.join(', '),
    );
  if (!deps.connected())
    throw new DispatchError('NOT_CONNECTED', 'A conexão caiu. Aguarde a reconexão.');
  const providerId =
    'NEXA' + createHash('sha256').update(input.id).digest('hex').slice(0, 28).toUpperCase();
  const attempt: Attempt = {
    id: input.id,
    targetHash,
    target: `${phone.slice(0, 5)}*****${phone.slice(-2)}`,
    at: now,
    status: 'PENDING',
    providerId,
    fingerprint,
    kind,
    ...(typeof input.campaignId === 'string' ? {campaignId:input.campaignId} : {}),
    jidHash,
    bodyEncrypted: deps.encrypt(text),
    phoneEncrypted: deps.encrypt(phone),
  };
  deps.attempts.push(attempt);
  await deps.persist(); // Never call the remote service if the ledger cannot be saved.
  if (deps.suppressed(targetHash) || deps.suppressed(jidHash)) {
    deps.attempts.splice(deps.attempts.indexOf(attempt), 1);
    await deps.persist();
    throw new DispatchError('SUPPRESSED', 'Este destinatário pediu para não receber mensagens.');
  }
  try {
    await deps.send(jid, text, providerId);
    attempt.status = 'SENT';
  } catch {
    attempt.status = 'UNCERTAIN';
  }
  await deps.persist();
  return attempt;
}
