import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input).padStart(11, '0');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number): number => {
    const sum = cpf.slice(0, length).split('').reduce((total, n, i) => total + Number(n) * (length + 1 - i), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function normalizeCpf(input: string | number): string | null {
  const raw = typeof input === 'number' ? String(input).padStart(11, '0') : onlyDigits(input);
  const cpf = raw.padStart(11, '0');
  return isValidCpf(cpf) ? cpf : null;
}

export function normalizeBrazilianPhone(input: string | number): string | null {
  let raw = onlyDigits(String(input));
  if (raw.startsWith('00')) raw = raw.slice(2);
  if (raw.length===10 || raw.length===11) raw = `55${raw}`;
  const parsed = parsePhoneNumberFromString(`+${raw}`);
  if (!parsed?.isValid() || parsed.country !== 'BR') return null;
  const national = parsed.nationalNumber;
  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99 || national.length < 10 || national.length > 11) return null;
  return parsed.number;
}

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export const normalizeName = (input: string): string => input.trim().replace(/\s+/g, ' ');

export function normalizeDecimal(input: unknown): string | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input.toFixed(2) : null;
  const value = String(input).trim().replace(/R\$\s?/gi, '').replace(/(?<=\d)\.(?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value).toFixed(2) : null;
}

export const maskCpf = (last4: string): string => `***.***.*${last4.slice(0, 2)}-${last4.slice(2)}`;
export const maskPhone = (phone: string): string => `${phone.slice(0, 5)}*****${phone.slice(-2)}`;
export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  return `${local?.slice(0, 2) ?? ''}***@${domain ?? '***'}`;
};
