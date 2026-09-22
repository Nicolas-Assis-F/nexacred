import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { EncryptionService } from '@nexacred/shared';
const db=new PrismaClient();
async function main(){
 if(process.env.SEED_DEMO!=='true')return;
 const email=process.env.DEV_ADMIN_EMAIL??'admin@nexacred.local';
 const password=process.env.DEV_ADMIN_PASSWORD;if(!password||password.length<12)throw new Error('DEV_ADMIN_PASSWORD requires 12+ characters');
 await db.user.upsert({where:{email},create:{email,name:'Administrador',role:'ADMIN',passwordHash:await hash(password)},update:{}});
 const crypto=new EncryptionService(process.env.PII_ENCRYPTION_KEY??'',process.env.PII_HMAC_SECRET??'');
 // Synthetic identities for development only. Email uses reserved .invalid domain.
 for(const [index,cpf] of ['52998224725','11144477735','01234567890'].entries()){
  const name=['Ana Exemplo','Bruno Demonstração','Carla Teste'][index]!;const value=`demo${index+1}@example.invalid`;
  const lead=await db.lead.upsert({where:{cpfHash:crypto.hmac(cpf)},create:{name,cpfEncrypted:crypto.encrypt(cpf),cpfHash:crypto.hmac(cpf),cpfLast4:cpf.slice(-4),organization:'Órgão Fictício',position:'Demonstração',availableMargin:500+index*100},update:{}});
  const contact=await db.leadContact.upsert({where:{leadId_type_valueHash:{leadId:lead.id,type:'EMAIL',valueHash:crypto.hmac(value)}},create:{leadId:lead.id,type:'EMAIL',valueEncrypted:crypto.encrypt(value),valueHash:crypto.hmac(value),maskedValue:`de***@example.invalid`,isPrimary:true},update:{}});
  if(!await db.consent.count({where:{contactId:contact.id}}))await db.consent.create({data:{leadId:lead.id,contactId:contact.id,channel:'EMAIL',purpose:'CREDIT_MARKETING',status:'GRANTED',source:'SYNTHETIC_DEMO',proof:{demo:true},grantedAt:new Date()}});
 }
 const segment=await db.segment.upsert({where:{id:'00000000-0000-4000-8000-000000000001'},create:{id:'00000000-0000-4000-8000-000000000001',name:'Base de demonstração',filters:{organization:'Órgão Fictício'}},update:{}});
 const template=await db.messageTemplate.upsert({where:{id:'00000000-0000-4000-8000-000000000002'},create:{id:'00000000-0000-4000-8000-000000000002',name:'Primeiro contato',channel:'EMAIL',body:'Olá, {{nome}}! Podemos encaminhar seu interesse para um atendente? Para sair, responda SAIR.'},update:{}});
 await db.campaign.upsert({where:{id:'00000000-0000-4000-8000-000000000003'},create:{id:'00000000-0000-4000-8000-000000000003',name:'Campanha de demonstração',channel:'EMAIL',segmentId:segment.id,templateId:template.id,allowedStartHour:0,allowedEndHour:24},update:{}});
}
main().finally(()=>db.$disconnect());
