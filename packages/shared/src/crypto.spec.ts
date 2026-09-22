import { describe, expect, it } from 'vitest';
import { EncryptionService } from './crypto.js';

describe('EncryptionService', () => {
  const service = new EncryptionService(Buffer.alloc(32, 7).toString('base64'), 'x'.repeat(32));
  it('roundtrips AES-GCM data', () => {
    const encrypted = service.encrypt('52998224725');
    expect(encrypted).not.toContain('52998224725');
    expect(service.decrypt(encrypted)).toBe('52998224725');
  });
  it('uses deterministic HMAC for identity', () => {
    expect(service.hmac('value')).toBe(service.hmac('value'));
    expect(service.hmac('value')).not.toBe(service.hmac('other'));
  });
});
