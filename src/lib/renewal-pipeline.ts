import { isClosedComponent } from './renewal-active-cycle';

/** Calendar days in the viewer's timezone, unaffected by DST or time of day. */
export function renewalDays(date: string | null | undefined, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) return null;
  const y = Number(m[1]), month = Number(m[2]) - 1, day = Number(m[3]);
  const target = new Date(Date.UTC(y, month, day));
  if (target.getUTCFullYear() !== y || target.getUTCMonth() !== month || target.getUTCDate() !== day) return null;
  return Math.round((target.getTime() - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}
export function renewalUrgency(days: number | null): string {
  if (days === null) return 'Unknown';
  return days < 0 ? 'Critical' : days <= 30 ? 'High' : days <= 90 ? 'Medium' : 'Low';
}
export function renewalDeadline(row: any, days: number | null): string {
  if (isClosedComponent(row)) return 'Closed';
  return days === null ? 'Date missing' : days < 0 ? 'Overdue' : days <= 30 ? 'Due Soon' : 'Upcoming';
}
export function renewalResult(row: any): string {
  if (row.outcome === 'lost' || row.status === 'Lost') return 'Lost';
  if (row.outcome === 'renewed' || ['Won','Renewed'].includes(row.status)) return 'Renewed';
  return isClosedComponent(row) ? 'Closed (legacy)' : 'Open';
}
export const RENEWAL_STAGES = ['Not started', 'In preparation', 'Proposal validated', 'Proposal sent', 'Accepted', 'In progress', 'In negotiation'] as const;
export function renewalStage(row: any, proposalStatus?: string | null): string {
  if (isClosedComponent(row)) return 'Closed';
  if (proposalStatus === 'Accepted' || proposalStatus === 'Won') return 'Accepted';
  if (proposalStatus === 'Sent') return 'Proposal sent';
  if (proposalStatus === 'Ready') return 'Proposal validated';
  if (proposalStatus === 'Draft') return 'In preparation';
  if (row.status === 'In Negotiation') return 'In negotiation';
  if (row.status === 'Quoted') return 'In progress'; // Legacy flag is not evidence of a sent proposal.
  return row.status === 'In Progress' ? 'In progress' : 'Not started';
}
/** Canonical relation wins; legacy references are display-only and must resolve. */
export function renewalPartner(row: any, client: any, partners: { id: string; company_name: string }[]) {
  const canonical = row.partner_uuid || client?.partner_uuid;
  if (canonical) return { id: canonical, name: partners.find(p => p.id === canonical)?.company_name || 'Partner unavailable' };
  const legacy = row.partner_id || client?.partner_id;
  if (!legacy) return { id: null, name: 'HQ Direct' };
  const match = partners.find(p => p.id === legacy || p.company_name.toLowerCase() === String(legacy).trim().toLowerCase());
  return { id: match?.id || 'unresolved', name: match?.company_name || 'Partner to confirm' };
}
/** Keep each canonical closed cycle in history, even when an open cycle exists. */
export function withRenewalHistory(activeRows: any[], explicit: any[]): any[] {
  const closed = explicit.filter(r => !r.superseded_by_renewal_id && isClosedComponent(r));
  return [...activeRows.filter(r => !isClosedComponent(r)), ...closed.map(r => ({ ...r, renewal_type: 'Commercial', included_services: [], _components: [r] }))];
}
