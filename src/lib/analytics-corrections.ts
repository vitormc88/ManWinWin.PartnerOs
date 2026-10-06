/** Analytics correction package 1 — pure helpers (no IO). */
import { isClosedComponent } from "./renewal-active-cycle";

/** Canonical deal value (matches Pipeline): non-zero total_value, else expected_value. */
export function authDealValue(d: { total_value?: any; expected_value?: any }): number {
  const t = Number(d.total_value || 0);
  return t !== 0 ? t : Number(d.expected_value || 0);
}

export function largestOpenDeals<T extends { total_value?: any; expected_value?: any }>(deals: T[], n = 5) {
  return deals.map((d) => ({ ...d, _value: authDealValue(d) })).sort((a, b) => b._value - a._value).slice(0, n);
}

/** Aggregate win rate = total won / (won + lost). null when nothing closed. */
export function aggregateWinRate(rows: Array<{ won_count: number; lost_count: number }>): number | null {
  const won = rows.reduce((s, r) => s + r.won_count, 0);
  const lost = rows.reduce((s, r) => s + r.lost_count, 0);
  return won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
}

/** Renewal is in the active pipeline unless closed (closed_at / outcome / Won|Lost|Completed). */
export function isRenewalOpen(r: any): boolean {
  return !isClosedComponent(r);
}

export function isRenewalOverdue(r: any, now = Date.now()): boolean {
  if (!isRenewalOpen(r)) return false;
  const s = (r.status || "").toLowerCase();
  if (s === "overdue" || s === "expired") return true;
  if (!r.renewal_date) return false;
  return Math.ceil((new Date(r.renewal_date).getTime() - now) / 86400000) < 0;
}

export type RenewalTone = "red" | "amber" | "green" | "blue" | "muted";
/** Display label never relabels Lost as Overdue; Completed is not assumed Won. */
export function renewalStatusDisplay(status: string | null | undefined): { tone: RenewalTone; label: string } {
  const s = (status || "").toLowerCase();
  if (s === "lost") return { tone: "muted", label: "Lost" };
  if (s === "overdue" || s === "expired") return { tone: "red", label: status === "Expired" ? "Expired" : "Overdue" };
  if (s === "due soon") return { tone: "amber", label: "Due Soon" };
  if (s === "won") return { tone: "green", label: "Won" };
  if (s === "completed") return { tone: "green", label: "Completed" };
  return { tone: "blue", label: status || "Upcoming" };
}

/** Owner: assigned_user_id profile, then assigned_owner (profile id or free text). */
export function resolveRenewalOwner(
  r: { assigned_user_id?: string | null; assigned_owner?: string | null },
  profiles?: Map<string, { full_name?: string | null; email?: string | null }> | null,
): string | null {
  const byId = (id?: string | null) => {
    const p = id && profiles ? profiles.get(id) : null;
    return p ? p.full_name || p.email || null : null;
  };
  return byId(r.assigned_user_id) || byId(r.assigned_owner) || (r.assigned_owner?.trim() || null);
}

/** Sorting-independent value ranking: always by value desc. */
export function rankByValue<T extends { value: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.value - a.value);
}

/** Active partner rule (matches usePartners): is_active true and not Archived. */
export function isPartnerActive(p: { is_active?: boolean | null; status?: string | null } | null | undefined): boolean {
  if (!p) return false;
  return p.is_active !== false && (p.status || "") !== "Archived";
}

/** KPI text: unknown when loading/failed, never a fake zero. */
export function kpiText(state: { isLoading?: boolean; isError?: boolean }, render: () => string): string {
  if (state.isError) return "Unavailable";
  if (state.isLoading) return "…";
  return render();
}

/** End of current quarter, inclusive of the whole last day. */
export function quarterEndInclusive(now = new Date()): Date {
  const q = Math.floor(now.getMonth() / 3);
  return new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
}
export function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Shared open-renewal summary used by every Analytics tab. Input must be the
 * operational unified renewal list (useRenewals from useDeals: explicit cycles
 * plus derived contract/licence rows, already deduplicated/suppressed there),
 * so Analytics counts match the Renewals module. Ids are deduplicated here as a
 * safety net; closed rows are excluded.
 */
export function summarizeOpenRenewals(rows: any[], now = Date.now()) {
  const seen = new Set<string>();
  const open = (rows || []).filter((r) => {
    const id = String(r?.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return isRenewalOpen(r);
  });
  const overdue = open.filter((r) => isRenewalOverdue(r, now));
  const upcoming90 = open.filter((r) => {
    if (!r.renewal_date || isRenewalOverdue(r, now)) return false;
    const d = Math.ceil((new Date(r.renewal_date).getTime() - now) / 86400000);
    return d >= 0 && d <= 90;
  });
  const overdueByPartner = new Map<string, number>();
  overdue.forEach((r) => {
    const pid = r.partner_id || "__unassigned__";
    overdueByPartner.set(pid, (overdueByPartner.get(pid) || 0) + 1);
  });
  return {
    open,
    overdue,
    overdueIds: overdue.map((r) => String(r.id)),
    overdueValue: overdue.reduce((s, r) => s + Number(r.estimated_value || 0), 0),
    upcoming90: upcoming90.length,
    overdueByPartner,
    partnersWithOverdue: overdueByPartner.size,
  };
}

/** Salespeople split: distinct user ids (never merged by name) vs unlinked names. */
export function salespeopleBreakdown(rows: Array<{ user_id: string | null; is_unlinked?: boolean }>) {
  const linked = new Set(rows.filter((r) => r.user_id && !r.is_unlinked).map((r) => r.user_id as string)).size;
  return { linked, unlinked: rows.filter((r) => !r.user_id || r.is_unlinked).length, rows: rows.length };
}
