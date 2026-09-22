import {AuthGuard} from '@nestjs/passport';
import {IsString,IsUUID,MaxLength} from 'class-validator';
import {PermissionGuard,RequirePermission} from '../common/rbac.js';
class SimulationDto {@IsUUID() contactId!:string; @IsString() @MaxLength(4000) body!:string;}
import { BadRequestException, Body, Controller, Headers, Param, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { timingSafeEqual } from 'node:crypto';
import { MockMessagingProvider } from '@nexacred/messaging';
import { classify, normalizeBrazilianPhone, normalizeEmail } from '@nexacred/shared';
import { PrismaService } from '../common/prisma.service.js';
import { PiiEncryptionService } from '../common/encryption.provider.js';

@ApiTags('webhooks') @Controller('webhooks')
export class WebhooksController {
 private readonly mock=new MockMessagingProvider();
 constructor(private readonly prisma:PrismaService,private readonly crypto:PiiEncryptionService,@InjectQueue('webhook-processing')private readonly queue:Queue){}
 @Post('mock/simulate') @UseGuards(AuthGuard('jwt'),PermissionGuard) @RequirePermission('conversation:write') async simulate(@Body()dto:SimulationDto){const contact=await this.prisma.leadContact.findUniqueOrThrow({where:{id:dto.contactId}});return this.receive('mock',{eventId:crypto.randomUUID(),type:'INBOUND_REPLY',from:this.crypto.decrypt(contact.valueEncrypted),body:dto.body},process.env.MOCK_WEBHOOK_SECRET);}
 @Post(':provider') async receive(@Param('provider')provider:string,@Body()body:unknown,@Headers('x-webhook-secret')secret?:string){
  const expected=process.env.MOCK_WEBHOOK_SECRET??'';const supplied=Buffer.from(secret??'');
  if(!expected||supplied.length!==Buffer.byteLength(expected)||!timingSafeEqual(supplied,Buffer.from(expected)))throw new UnauthorizedException();
  if(provider!=='mock')throw new BadRequestException('Provider não configurado');
  let parsed;try{parsed=await this.mock.parseWebhook(body);}catch{throw new BadRequestException('Evento inválido');}
  let contactId:string|undefined;
  if(parsed.type==='INBOUND_REPLY'){
   const normalized=normalizeBrazilianPhone(parsed.from!)??normalizeEmail(parsed.from!);if(!normalized)throw new BadRequestException('Contato inválido');
   const contact=await this.prisma.leadContact.findFirst({where:{valueHash:this.crypto.hmac(normalized)}});if(!contact)throw new BadRequestException('Contato desconhecido');contactId=contact.id;
  }
  const event=await this.prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421)`;
   const existing=await tx.webhookEvent.findUnique({where:{provider_providerEventId:{provider,providerEventId:parsed.providerEventId}}});if(existing)return existing;
   if(contactId&&classify(parsed.body!)==='OPT_OUT'){
    const contact=await tx.leadContact.findUniqueOrThrow({where:{id:contactId},include:{lead:true}});
    for(const identityHash of [contact.valueHash,contact.lead.cpfHash])if(!await tx.suppression.findFirst({where:{identityHash,active:true}}))await tx.suppression.create({data:{leadId:contact.leadId,contactId,identityHash,reason:'OPT_OUT',source:'WEBHOOK'}});
    await tx.consent.updateMany({where:{leadId:contact.leadId},data:{status:'REVOKED',revokedAt:new Date()}});
   }
   return tx.webhookEvent.create({data:{provider,providerEventId:parsed.providerEventId,eventType:parsed.type,payload:{encrypted:this.crypto.encrypt(JSON.stringify({...body as object,...(contactId?{contactId}:{})}))}}});
  });
  if(!event.processed)await this.queue.add('webhook',{webhookEventId:event.id},{jobId:`webhook-${event.id}`,attempts:5,backoff:{type:'exponential',delay:2000},removeOnComplete:true});
  return {accepted:true,eventId:event.id};
 }
}
