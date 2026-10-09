import { describe, it, expect } from 'vitest';
import { renewalDays, renewalUrgency, renewalDeadline, renewalStage, renewalResult, renewalPartner, withRenewalHistory } from '../renewal-pipeline';
const today = new Date(2026, 9, 9, 23, 59);
describe('renewal pipeline business behavior', () => {
  it('uses calendar days: today is not overdue, yesterday is overdue, invalid dates are unknown', () => {
    expect(renewalDays('2026-10-09', today)).toBe(0);
    expect(renewalDays('2026-10-08', today)).toBe(-1);
    expect(renewalDays('2026-02-30', today)).toBeNull();
    expect(renewalDays(null, today)).toBeNull();
    expect(renewalDays('2026-03-30', new Date(2026, 2, 28, 23))).toBe(2);
  });
  it('updates urgency when a renewal approaches, despite a stale stored Medium', () => {
    const row = { priority: 'Medium', status: 'Upcoming', renewal_date: '2026-10-20' };
    expect(renewalUrgency(renewalDays(row.renewal_date, today))).toBe('High');
    expect(renewalDeadline(row, renewalDays(row.renewal_date, today))).toBe('Due Soon');
    expect(renewalUrgency(-1)).toBe('Critical');
    expect(renewalUrgency(30)).toBe('High');
    expect(renewalUrgency(31)).toBe('Medium');
    expect(renewalUrgency(90)).toBe('Medium');
    expect(renewalUrgency(91)).toBe('Low');
    expect(renewalUrgency(null)).toBe('Unknown');
  });
  it('A renewal can be overdue and have a validated proposal at the same time', () => {
    const row = { status: 'Upcoming', renewal_date: '2026-10-08' };
    expect(renewalDeadline(row, renewalDays(row.renewal_date, today))).toBe('Overdue');
    expect(renewalStage(row, 'Ready')).toBe('Proposal validated');
    expect(renewalResult(row)).toBe('Open');
  });
  it('does not confuse accepted proposals with closed revenue or legacy completion with a win', () => {
    expect(renewalStage({ status: 'Upcoming' }, 'Accepted')).toBe('Accepted');
    expect(renewalResult({ status: 'Upcoming' })).toBe('Open');
    expect(renewalResult({ status: 'Completed' })).toBe('Closed (legacy)');
    expect(renewalResult({ outcome: 'renewed', closed_at: '2026-10-08' })).toBe('Renewed');
    expect(renewalDeadline({ outcome: 'lost' }, -90)).toBe('Closed');
  });
  it('A renewal resolves its canonical partner and never silently calls an unknown legacy partner HQ', () => {
    const partners = [{ id: 'mena-id', company_name: 'Partner Alpha' }];
    expect(renewalPartner({ partner_uuid: 'mena-id', partner_id: null }, {}, partners)).toEqual({ id: 'mena-id', name: 'Partner Alpha' });
    expect(renewalPartner({ partner_uuid: 'mena-id', partner_id: 'wrong' }, {}, partners).id).toBe('mena-id');
    expect(renewalPartner({ partner_id: 'missing' }, {}, partners).name).toBe('Partner to confirm');
    expect(renewalPartner({}, {}, partners).name).toBe('HQ Direct');
  });
  it('preserves multiple historical cycles with an active next cycle, without reconciled duplicates', () => {
    const open = { id: 'next', client_id: 'a', status: 'Upcoming' };
    const won = { id: 'old-won', client_id: 'a', status: 'Won' };
    const lost = { id: 'old-lost', client_id: 'a', status: 'Lost' };
    const duplicate = { ...lost, id: 'duplicate', superseded_by_renewal_id: 'old-lost' };
    const history = withRenewalHistory([open, won], [open, won, lost, duplicate]);
    expect(history.map(r => r.id)).toEqual(['next', 'old-won', 'old-lost']);
    expect(withRenewalHistory([won], [won]).map(r => r.id)).toEqual(['old-won']);
  });
});
