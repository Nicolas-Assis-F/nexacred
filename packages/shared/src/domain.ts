export function classify(text: string): 'OPT_OUT' | 'INTERESTED' | 'NOT_INTERESTED' | 'WAITING_HUMAN' | 'NEW' {
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(SAIR|PARAR|CANCELAR|REMOVER|NAO QUERO)\b/.test(value)) return 'OPT_OUT';
  if (/\b(SEM INTERESSE|NAO TENHO INTERESSE|NAO OBRIGADO)\b/.test(value)) return 'NOT_INTERESTED';
  if (/\b(ATENDENTE|HUMANO|PESSOA|COMO|QUANDO|QUAL|QUANTO|ONDE)\b/.test(value) || text.includes('?')) return 'WAITING_HUMAN';
  if (/\b(SIM|TENHO INTERESSE|QUERO SABER|INTERESSADO)\b/.test(value)) return 'INTERESTED';
  return 'NEW';
}
export const botReplies = {
  OPT_OUT: 'Seu pedido de saída foi registrado. Você não receberá novas campanhas.',
  INTERESTED: 'Obrigado pelo interesse. Um atendente explicará os próximos passos. A análise não garante aprovação.',
  NOT_INTERESTED: 'Entendido. Não daremos continuidade a esta conversa.',
  WAITING_HUMAN: 'Sua conversa está aguardando um atendente.',
  NEW: 'Posso encaminhar você para um atendente. Para não receber campanhas, responda SAIR.',
} as const;
export const contactTypeFor = (channel: string): 'PHONE' | 'EMAIL' => channel === 'SMS' ? 'PHONE' : 'EMAIL';
export const channelFor = (type: string): 'SMS' | 'EMAIL' => type === 'PHONE' ? 'SMS' : 'EMAIL';
export const CONSENT_PURPOSE = 'CREDIT_MARKETING';
