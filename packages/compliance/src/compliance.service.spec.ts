import { describe, expect, it } from 'vitest';
import { ComplianceService, type ComplianceFacts } from './compliance.service.js';

const service = new ComplianceService();
const lead = { id: 'lead', status: 'ACTIVE' };
const contact = { id: 'contact', status: 'VALID', valueHash: 'hash' };
const campaign = { id: 'campaign', status: 'RUNNING', requireConsent: true, allowedStartHour: 8, allowedEndHour: 20, hourlyLimit: 100, dailyLimit: 1000 };
const facts: ComplianceFacts = { suppressed: false, hasConsent: true, alreadyRecipient: false, duplicateContact: false, sentLastHour: 0, sentToday: 0, previousSuccessfulSend: false, now: new Date('2026-09-22T12:00:00') };

describe('ComplianceService', () => {
  it('allows a fully eligible recipient', () => expect(service.canSend({ lead, contact, campaign, facts })).toEqual({ allowed: true, reasons: [] }));
  it.each([
    ['suppression', { suppressed: true }, 'SUPPRESSED'],
    ['consent', { hasConsent: false }, 'CONSENT_REQUIRED'],
    ['duplicate', { duplicateContact: true }, 'DUPLICATE_CONTACT'],
    ['hourly limit', { sentLastHour: 100 }, 'HOURLY_LIMIT'],
    ['daily limit', { sentToday: 1000 }, 'DAILY_LIMIT'],
  ])('blocks by %s', (_label, update, reason) => {
    const result = service.canSend({ lead, contact, campaign, facts: { ...facts, ...update } });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain(reason);
  });
  it('returns every applicable reason', () => {
    const result = service.canSend({ lead: { ...lead, status: 'SUPPRESSED' }, contact: { ...contact, status: 'INVALID' }, campaign, facts: { ...facts, suppressed: true, hasConsent: false } });
    expect(result.reasons).toEqual(expect.arrayContaining(['LEAD_INACTIVE', 'CONTACT_INVALID', 'SUPPRESSED', 'CONSENT_REQUIRED']));
  });
});

it.each(['DRAFT','APPROVED','PAUSED','COMPLETED','CANCELLED'])('never sends in %s',status=>expect(service.canSend({lead,contact,campaign:{...campaign,status},facts}).reasons).toContain('CAMPAIGN_NOT_ACTIVE'));
it('blocks a previously sent recipient',()=>expect(service.canSend({lead,contact,campaign,facts:{...facts,previousSuccessfulSend:true}}).reasons).toContain('ALREADY_SENT'));
it('enforces contact frequency across campaigns',()=>expect(service.canSend({lead,contact,campaign,facts:{...facts,recentContact:true}}).reasons).toContain('FREQUENCY_LIMIT'));
it('uses Sao Paulo hours instead of host timezone',()=>expect(service.canSend({lead,contact,campaign,facts:{...facts,now:new Date('2026-09-22T10:00:00Z')}}).reasons).toContain('OUTSIDE_ALLOWED_HOURS'));
it('defers a future campaign',()=>expect(service.canSend({lead,contact,campaign:{...campaign,startAt:new Date('2099-01-01')},facts}).reasons).toContain('CAMPAIGN_NOT_STARTED'));
it('stops expired campaigns',()=>expect(service.canSend({lead,contact,campaign:{...campaign,endAt:new Date('2000-01-01')},facts}).reasons).toContain('CAMPAIGN_ENDED'));
