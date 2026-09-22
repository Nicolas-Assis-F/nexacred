import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import path from 'node:path';
test('XLSB → consent → campaign → mock delivery → inbox → opt-out → reimport',async({page})=>{
 await page.goto('/login');await page.getByLabel('E-mail').fill('admin@nexacred.local');await page.getByLabel('Senha').fill('DevOnly-ChangeMe123!');await page.getByRole('button',{name:'Entrar no painel'}).click();await expect(page.getByRole('heading',{name:'Visão geral'})).toBeVisible();
 const origin=process.env.E2E_BASE_URL??'http://localhost:3000';
 async function post(route:string,body:object){const response=await page.request.post(`/api${route}`,{data:body,headers:{origin}});expect(response.ok(),await response.text()).toBeTruthy();return response.json();}
 async function get(route:string){const response=await page.request.get(`/api${route}`);expect(response.ok()).toBeTruthy();return response.json();}
 const fixture=readFileSync(path.resolve('fixtures/leads-synthetic.xlsb'));
 async function upload(){const response=await page.request.post('/api/imports',{headers:{origin},multipart:{file:{name:'leads-synthetic.xlsb',mimeType:'application/octet-stream',buffer:fixture},sheetName:'Dados',mapping:JSON.stringify({cpf:'CPF',name:'NOME SERVIDOR',email1:'EMAIL',organization:'NOME ORGÃO'})}});expect(response.ok(),await response.text()).toBeTruthy();const result=await response.json();await expect.poll(async()=> (await get(`/imports/${result.importId}`)).status).toBe('COMPLETED');return get(`/imports/${result.importId}`);}
 const imported=await upload();expect(imported.processedRows).toBe(3);expect(imported.invalidRows).toBe(1);expect(imported.duplicateRows).toBeGreaterThanOrEqual(1);
 const list=await get('/leads?search=Pessoa%20Fixture');expect(list.items).toHaveLength(1);expect(list.items[0].cpfEncrypted).toBeUndefined();expect(list.items[0].cpfHash).toBeUndefined();
 const lead=await get(`/leads/${list.items[0].id}`);const contact=lead.contacts.find((c:{maskedValue:string})=>c.maskedValue.startsWith('te'));
 expect(contact).toBeTruthy();expect(contact.valueEncrypted).toBeUndefined();
 await post(`/leads/${lead.id}/consents`,{contactId:contact.id,channel:'EMAIL',status:'GRANTED',source:'E2E_SYNTHETIC',proof:'Test fixture authorization',grantedAt:new Date().toISOString()});
 const segment=await post('/segments',{name:'Fixture E2E',filters:{organization:'Órgão Fixture'}});
 const template=await post('/templates',{name:'Fixture',channel:'EMAIL',body:'Olá {{nome}}, quer conversar com um atendente? Para sair responda SAIR.'});
 const campaign=await post('/campaigns',{name:'E2E Campaign',channel:'EMAIL',segmentId:segment.id,templateId:template.id,hourlyLimit:50,dailyLimit:100,allowedStartHour:0,allowedEndHour:24,requireConsent:true});
 const preview=await post(`/campaigns/${campaign.id}/preview`,{});expect(preview.eligible).toBeGreaterThan(0);
 await post(`/campaigns/${campaign.id}/approve`,{});await post(`/campaigns/${campaign.id}/start`,{});
 await expect.poll(async()=>{const conversations=await get('/conversations');const c=conversations.find((c:{contactId:string})=>c.contactId===contact.id);if(!c)return false;const detail=await get(`/conversations/${c.id}`);return detail.messages.some((m:{status:string})=>m.status==='DELIVERED');}).toBeTruthy();
 await post('/webhooks/mock/simulate',{contactId:contact.id,body:'Sim, tenho interesse'});
 await expect.poll(async()=> (await get('/conversations')).find((c:{contactId:string})=>c.contactId===contact.id)?.status).toBe('INTERESTED');
 await post('/webhooks/mock/simulate',{contactId:contact.id,body:'Não quero mais. REMOVER!'});
 await expect.poll(async()=> (await get('/conversations')).find((c:{contactId:string})=>c.contactId===contact.id)?.status).toBe('OPT_OUT');
 expect((await get('/suppressions')).some((s:{reason:string;contactId:string})=>s.reason==='OPT_OUT'&&s.contactId===contact.id)).toBeTruthy();
 await upload();const after=await post(`/campaigns/${campaign.id}/preview`,{});expect(after.eligible).toBe(0);expect(after.suppressed).toBeGreaterThan(0);
 await page.goto('/conversations');await expect(page.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();await page.getByRole('button',{name:/Pessoa Fixture/}).first().click();await expect(page.getByText('Não quero mais. REMOVER!',{exact:true})).toBeVisible();
});
