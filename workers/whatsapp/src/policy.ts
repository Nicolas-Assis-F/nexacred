import { ComplianceService } from '@nexacred/compliance';
import { normalizeBrazilianPhone } from '@nexacred/shared';
export function allowedNumbers(raw: string): string[] {
  const inputs = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const numbers = inputs.map((s) => normalizeBrazilianPhone(s));
  if (inputs.length > 5 || numbers.some((n) => !n))
    throw new Error('Configure até cinco números brasileiros válidos para testes.');
  return [...new Set(numbers as string[])];
}
export function canTest(input: {
  enabled: boolean;
  connected: boolean;
  phone: string;
  allowlist: string[];
  consent: boolean;
  suppressed: boolean;
  hourly: number;
  daily: number;
}) {
  const phone = normalizeBrazilianPhone(input.phone);
  const gate = new ComplianceService();
  const result = gate.canSend({
    lead: { id: 'test', status: 'ACTIVE' },
    contact: { id: 'test', status: phone ? 'VALID' : 'INVALID', valueHash: 'test' },
    campaign: {
      id: 'test',
      status: 'RUNNING',
      requireConsent: true,
      allowedStartHour: 0,
      allowedEndHour: 24,
      hourlyLimit: 5,
      dailyLimit: 20,
    },
    facts: {
      suppressed: input.suppressed,
      hasConsent: input.consent,
      alreadyRecipient: false,
      duplicateContact: false,
      sentLastHour: input.hourly,
      sentToday: input.daily,
      previousSuccessfulSend: false,
    },
  });
  if (!input.enabled) result.reasons.push('LAB_DISABLED');
  if (!input.connected) result.reasons.push('NOT_CONNECTED');
  if (!phone || !input.allowlist.includes(phone)) result.reasons.push('NOT_IN_TEST_ALLOWLIST');
  return { allowed: result.reasons.length === 0, reasons: result.reasons, phone };
}
