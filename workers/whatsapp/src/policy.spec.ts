import { describe, it, expect } from 'vitest';
import { allowedNumbers, canTest } from './policy.js';
const base = {
  enabled: true,
  connected: true,
  phone: '+5562999998888',
  allowlist: ['+5562999998888'],
  consent: true,
  suppressed: false,
  hourly: 0,
  daily: 0,
};
describe('WhatsApp test gate', () => {
  it('permits one explicitly authorized test', () => expect(canTest(base).allowed).toBe(true));
  it.each([
    { enabled: false },
    { connected: false },
    { consent: false },
    { suppressed: true },
    { allowlist: [] },
    { hourly: 5 },
    { daily: 20 },
    { phone: 'invalid' },
  ])('blocks missing requirement %j', (change) =>
    expect(canTest({ ...base, ...change }).allowed).toBe(false),
  );
  it('normalizes national numbers', () =>
    expect(allowedNumbers('62999998888')).toEqual(['+5562999998888']));
  it('rejects invalid allowlist configuration', () =>
    expect(() => allowedNumbers('abc')).toThrow());
});
