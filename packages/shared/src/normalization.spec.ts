import { describe, expect, it } from 'vitest';
import { isValidCpf, normalizeBrazilianPhone, normalizeEmail, normalizeName } from './normalization.js';

describe('normalization', () => {
  it('validates CPF check digits and rejects repeated digits', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('529.982.247-24')).toBe(false);
  });
  it('normalizes Brazilian numbers to E.164', () => expect(normalizeBrazilianPhone('(62) 99999-1234')).toBe('+5562999991234'));
  it('normalizes email and name', () => {
    expect(normalizeEmail(' TEST@Example.COM ')).toBe('test@example.com');
    expect(normalizeName(' Maria   da Silva ')).toBe('Maria da Silva');
  });
});
