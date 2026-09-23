import { Prisma, type PrismaClient } from '@prisma/client';
export const marketingPurpose = 'CREDIT_MARKETING';
export async function contactFacts(db: PrismaClient | Prisma.TransactionClient, leadId: string, contactId: string, channel: 'SMS' | 'EMAIL' | 'WHATSAPP') {
 const lead = await db.lead.findUniqueOrThrow({where:{id:leadId}});
 const contact = await db.leadContact.findUniqueOrThrow({where:{id:contactId}});
 const [suppressed,consents] = await Promise.all([
  db.suppression.count({where:{active:true,identityHash:{in:[lead.cpfHash,contact.valueHash]},OR:[{channel:null},{channel}]}}),
  db.consent.findMany({where:{leadId,channel,purpose:marketingPurpose,OR:[{contactId},{contactId:null}]},orderBy:{createdAt:'desc'}})
 ]);
 return {lead,contact,suppressed:suppressed>0,hasConsent:consents[0]?.status==='GRANTED'};
}
export function segmentWhere(filters: Record<string, unknown>): Prisma.LeadWhereInput {
 const where: Prisma.LeadWhereInput = {status: (filters.status as Prisma.EnumLeadStatusFilter['equals']) ?? 'ACTIVE'};
 for (const key of ['organization','position','employmentStatus'] as const) if (typeof filters[key] === 'string') where[key] = {contains:filters[key],mode:'insensitive'};
 if (typeof filters.importId === 'string') where.sourceImportId = filters.importId;
 for (const key of ['availableMargin','contractsCount'] as const) {
  const value=filters[key]; if (value && typeof value==='object') {const range=value as {min?:number;max?:number};where[key]={...(range.min!==undefined?{gte:range.min}:{}),...(range.max!==undefined?{lte:range.max}:{})};}
 }
 return where;
}
