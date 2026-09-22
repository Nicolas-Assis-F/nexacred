import { Injectable } from '@nestjs/common';
export type Intent =
  'INTERESTED' | 'NOT_INTERESTED' | 'OPT_OUT' | 'QUESTION' | 'HUMAN_REQUEST' | 'UNKNOWN';
export interface IntentClassifier {
  classify(text: string): Promise<Intent>;
}

@Injectable()
export class RuleIntentClassifier implements IntentClassifier {
  async classify(text: string): Promise<Intent> {
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (/\b(SAIR|PARAR|CANCELAR|REMOVER|NAO QUERO)\b/.test(normalized)) return 'OPT_OUT';
    if (/\b(ATENDENTE|HUMANO|PESSOA|FALAR COM)\b/.test(normalized)) return 'HUMAN_REQUEST';
    if (/\b(SIM|TENHO INTERESSE|QUERO SABER|INTERESSADO)\b/.test(normalized)) return 'INTERESTED';
    if (/\b(SEM INTERESSE|NAO TENHO INTERESSE|NAO OBRIGADO)\b/.test(normalized))
      return 'NOT_INTERESTED';
    if (normalized.includes('?') || /\b(COMO|QUANDO|QUAL|QUANTO|ONDE)\b/.test(normalized))
      return 'QUESTION';
    return 'UNKNOWN';
  }
}

@Injectable()
export class BotService {
  constructor(private readonly classifier: RuleIntentClassifier) {}
  async interpret(text: string) {
    const intent = await this.classifier.classify(text);
    const responses: Record<Intent, string | null> = {
      INTERESTED:
        'Obrigado pelo interesse. Um atendente continuará com você e explicará os próximos passos, sem promessa de aprovação.',
      NOT_INTERESTED: 'Entendido. Não daremos continuidade a esta conversa.',
      OPT_OUT: 'Seu pedido foi confirmado. Este contato não receberá novas campanhas.',
      QUESTION:
        'Recebi sua pergunta. Um atendente poderá esclarecer as condições aplicáveis ao seu caso.',
      HUMAN_REQUEST: 'Certo. Encaminhei a conversa para atendimento humano.',
      UNKNOWN: null,
    };
    return { intent, response: responses[intent] };
  }
}
