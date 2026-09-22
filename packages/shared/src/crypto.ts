import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export interface CryptoPort {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  hmac(value: string): string;
}

export class EncryptionService implements CryptoPort {
  private readonly key: Buffer;

  constructor(
    base64Key: string,
    private readonly hmacSecret: string,
  ) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) throw new Error('PII_ENCRYPTION_KEY must decode to 32 bytes');
    if (hmacSecret.length < 32) throw new Error('PII_HMAC_SECRET must contain at least 32 chars');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  decrypt(ciphertext: string): string {
    const [version, iv, tag, encrypted] = ciphertext.split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Invalid encrypted payload');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  }

  hmac(value: string): string {
    return createHmac('sha256', this.hmacSecret).update(value, 'utf8').digest('hex');
  }
}
