/** Presentation-only helpers. Never infer approval, access or commercial readiness. */
export const RESOURCE_LANGUAGES = { en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French' } as const;
export function resourceLanguage(doc: { title?: string | null; file_name?: string | null; tags?: string[] | null }): string {
  const text = `${doc.title ?? ''} ${doc.file_name ?? ''} ${(doc.tags ?? []).join(' ')}`;
  const languages = Object.entries(RESOURCE_LANGUAGES).filter(([code, name]) =>
    new RegExp(`(?:^|[\\s_.-])(?:${code}|${name})(?=$|[\\s_.-])`, 'i').test(text));
  return languages.length === 1 ? languages[0][0] : 'unconfirmed';
}
export function resourceYear(doc: { title?: string | null; file_name?: string | null }): string {
  const years = [...new Set(`${doc.title ?? ''} ${doc.file_name ?? ''}`.match(/\b20\d{2}\b/g) ?? [])];
  return years.length === 1 ? years[0] : '';
}
export function conversionSample(won: number, lost: number): string {
  const closed = won + lost;
  return `${won} won / ${closed} closed${closed > 0 && closed < 5 ? ' · small sample' : ''}`;
}
export function labelledTestNotification(title: string): boolean {
  return /^\s*(?:\[test\]|test(?:\s|:|-)|\[teste\]|teste(?:\s|:|-))/i.test(title);
}
export function matchesUserFilters(user: { is_hq: boolean | null; is_active: boolean | null; invitation_status: string | null; partner_id: string | null; roles: string[] }, filters: { role: string; partner: string; status: string }): boolean {
  if (filters.role !== 'all' && !user.roles.includes(filters.role)) return false;
  if (filters.partner === 'hq' ? user.is_hq !== true : filters.partner === 'unassigned' ? user.is_hq === true || !!user.partner_id : filters.partner !== 'all' && user.partner_id !== filters.partner) return false;
  if (filters.status === 'active' && user.is_active !== true) return false;
  if (filters.status === 'inactive' && user.is_active !== false) return false;
  if (filters.status === 'pending' && user.invitation_status !== 'pending') return false;
  return true;
}
