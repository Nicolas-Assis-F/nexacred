import { Injectable } from '@nestjs/common';
import { EncryptionService } from '@nexacred/shared';

@Injectable()
export class PiiEncryptionService extends EncryptionService {
  constructor() {
    super(process.env.PII_ENCRYPTION_KEY ?? '', process.env.PII_HMAC_SECRET ?? '');
  }
}
