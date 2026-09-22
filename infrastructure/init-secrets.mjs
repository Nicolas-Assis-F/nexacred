import {randomBytes} from 'node:crypto';
import {existsSync,writeFileSync} from 'node:fs';
const path='/run/nexacred/runtime.env';
if(!existsSync(path)){
 const keys=['JWT_SECRET','PII_ENCRYPTION_KEY','PII_HMAC_SECRET','MOCK_WEBHOOK_SECRET'];
 const content=keys.map(key=>`${key}=${randomBytes(32).toString('base64')}`).join('\n')+'\n';
 writeFileSync(path,content,{mode:0o600});
}
