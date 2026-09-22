export interface ComplianceLead { id: string; status: string; }
export interface ComplianceContact { id: string; status: string; valueHash: string; }
export interface ComplianceCampaign { id: string; status: string; requireConsent: boolean; startAt?: Date | null; endAt?: Date | null; allowedStartHour: number; allowedEndHour: number; hourlyLimit: number; dailyLimit: number; }
export interface ComplianceFacts { suppressed: boolean; hasConsent: boolean; alreadyRecipient: boolean; duplicateContact: boolean; sentLastHour: number; sentToday: number; previousSuccessfulSend: boolean; recentContact?: boolean; now?: Date; }
export interface ComplianceResult { allowed: boolean; reasons: string[]; }

export class ComplianceService {
  canSend(input: { lead: ComplianceLead; contact: ComplianceContact; campaign: ComplianceCampaign; facts: ComplianceFacts }): ComplianceResult {
    const { lead, contact, campaign, facts } = input;
    const now = facts.now ?? new Date();
    const reasons: string[] = [];
    if (lead.status !== 'ACTIVE') reasons.push('LEAD_INACTIVE');
    if (contact.status !== 'VALID') reasons.push('CONTACT_INVALID');
    if (facts.suppressed) reasons.push('SUPPRESSED');
    if (campaign.requireConsent && !facts.hasConsent) reasons.push('CONSENT_REQUIRED');
    if (campaign.status !== 'RUNNING') reasons.push('CAMPAIGN_NOT_ACTIVE');
    if (campaign.startAt && now < campaign.startAt) reasons.push('CAMPAIGN_NOT_STARTED');
    if (campaign.endAt && now > campaign.endAt) reasons.push('CAMPAIGN_ENDED');
    const hour = Number(new Intl.DateTimeFormat('en-US', {timeZone:'America/Sao_Paulo',hour:'numeric',hourCycle:'h23'}).format(now));
    if (hour < campaign.allowedStartHour || hour >= campaign.allowedEndHour) reasons.push('OUTSIDE_ALLOWED_HOURS');
    if (facts.alreadyRecipient || facts.previousSuccessfulSend) reasons.push('ALREADY_SENT');
    if (facts.recentContact) reasons.push('FREQUENCY_LIMIT');
    if (facts.duplicateContact) reasons.push('DUPLICATE_CONTACT');
    if (facts.sentLastHour >= campaign.hourlyLimit) reasons.push('HOURLY_LIMIT');
    if (facts.sentToday >= campaign.dailyLimit) reasons.push('DAILY_LIMIT');
    return { allowed: reasons.length === 0, reasons };
  }
}
