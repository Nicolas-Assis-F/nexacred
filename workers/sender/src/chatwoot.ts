import type { PrismaClient } from '@nexacred/database';

interface Contact { id:number; identifier:string; contact_inboxes?:Array<{source_id:string;inbox:{id:number}}> }
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object')throw new Error('Invalid Chatwoot response');return value as Record<string,unknown>;}
export async function syncChatwoot(db:PrismaClient):Promise<void>{
 const base=process.env.CHATWOOT_URL;const account=process.env.CHATWOOT_ACCOUNT_ID;const token=process.env.CHATWOOT_API_TOKEN??'';const inbox=Number(process.env.CHATWOOT_INBOX_ID);
 if(!base||!account||!token||!inbox)throw new Error('Chatwoot configuration missing');
 async function request(path:string,body?:object):Promise<unknown>{const response=await fetch(`${base}/api/v1/accounts/${account}${path}`,{method:body?'POST':'GET',headers:{api_access_token:token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`Chatwoot HTTP ${response.status}`);return response.json();}
 // One sync leader across replicas. The lock is released if its connection dies.
 await db.$transaction(async tx=>{
  const lock=await tx.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(73422) AS locked`;if(!lock[0]?.locked)return;
  for(const conversation of await tx.conversation.findMany({where:{messages:{some:{metadata:{equals:{chatwootPending:true}}}}},take:20,orderBy:{lastMessageAt:'asc'}})){
   let remoteId=conversation.chatwootId;
   if(!remoteId){
    const identifier=`nexacred-${conversation.contactId}`;
    const found=object(await request(`/contacts/search?q=${encodeURIComponent(identifier)}`));
    const contacts=Array.isArray(found.payload)?found.payload as Contact[]:[];
    let contact=contacts.find(c=>c.identifier===identifier);
    if(!contact){const created=object(await request('/contacts',{inbox_id:inbox,name:`Contato ${conversation.contactId.slice(0,8)}`,identifier}));const payload=created.payload;if(Array.isArray(payload))contact=payload[0] as Contact;else {const p=object(payload);contact=(p.contact??p) as Contact;}}
    if(!contact?.id)throw new Error('Contact not returned');
    const source=contact.contact_inboxes?.find(i=>i.inbox.id===inbox)?.source_id;
    if(!source)throw new Error('Configure an API inbox in Chatwoot');
    const existing=object(await request(`/contacts/${contact.id}/conversations`));
    const prior=Array.isArray(existing.payload)?existing.payload.map(object).find(c=>object(c.custom_attributes??{}).nexacred_id===conversation.id):undefined;
    const created=prior??object(await request('/conversations',{source_id:source,inbox_id:inbox,contact_id:contact.id,custom_attributes:{nexacred_id:conversation.id}}));
    remoteId=Number(created.id);if(!Number.isSafeInteger(remoteId)||remoteId<1)throw new Error('Conversation not returned');
    await tx.conversation.update({where:{id:conversation.id},data:{chatwootId:remoteId}});
   }
   const messages=await tx.message.findMany({where:{conversationId:conversation.id,metadata:{equals:{chatwootPending:true}}},take:50,orderBy:{createdAt:'asc'}});
   for(const message of messages){
    // All synchronized items are internal notes; never trigger a real transport.
    // Redact digit sequences and email addresses, including unsolicited PII in replies.
    const content=message.body.replace(/(?:\d[\s.()+-]*){7,}/g,'[dado removido]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email removido]');
    await request(`/conversations/${remoteId}/messages`,{content:`[NexaCred ${message.id}] ${message.direction==='INBOUND'?'Recebida':'Enviada'} (${message.status})\n${content}`,message_type:'outgoing',private:true});
    await tx.message.update({where:{id:message.id},data:{metadata:{chatwootSynced:true}}});
   }
  }
 },{timeout:60000,maxWait:1000});
}
