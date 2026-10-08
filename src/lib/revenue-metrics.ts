/**
 * Revenue metric separation.
 *
 * PartnerOS has three DIFFERENT money concepts that must never be mixed:
 *
 *  1. Historical / lifetime awarded revenue — `public.client_revenue_history.amount`.
 *     Year 1 + awarded renewals; imported history retains source dates. This is the ONLY source for
 *     anything labelled "Revenue" (lifetime, YTD, by country, by partner, monthly).
 *
 *  2. Won Deal Value ("New Business Won") — `public.deals` with status Won.
 *     A *sales* metric. Imported customers have no synthetic Won deals, so this
 *     is legitimately 0 for them. Never rendered as "Total Revenue".
 *
 *  3. Current ARR — contract / recurring value. Forward looking. Never summed
 *     into lifetime revenue.
 *
 * Everything here is pure: partner scoping is enforced by RLS on
 * `client_revenue_history` (the analytics views are `security_invoker=true`),
 * so a partner user simply receives fewer rows.
 */

/** Canonical UI labels — asserted by tests so the separation cannot silently regress. */
export const LIFETIME_REVENUE_LABEL = "Lifetime Revenue";
export const REVENUE_YTD_LABEL = "Total Revenue YTD";
export const NB_YTD_LABEL = "New Business YTD";
export const RENEWALS_YTD_LABEL = "Renewals YTD";
export const WON_DEAL_VALUE_LABEL = "Won Deal Value";
export const NEW_BUSINESS_WON_LABEL = "New Business Won";
export const CURRENT_ARR_LABEL = "Current ARR";

export interface RevenueHistoryRow {
  client_id: string;
  /** Canonical partner relation (mirrored from clients.partner_uuid by the view). */
  partner_uuid?: string | null;
  partner_name?: string | null;
  country?: string | null;
  amount: number | string | null | undefined;
  /** ISO date of the awarded entry. */
  revenue_date: string | null | undefined;
  revenue_type?: string | null;
  source?: string | null;
}

export interface RevenueSummary {
  lifetime_revenue: number;
  revenue_ytd: number;
  revenue_entry_count: number;
  clients_with_revenue: number;
  nb_ytd: number;
  renewals_ytd: number;
  other_ytd: number;
}

export const EMPTY_REVENUE_SUMMARY: RevenueSummary = {
  lifetime_revenue: 0,
  revenue_ytd: 0,
  revenue_entry_count: 0,
  clients_with_revenue: 0,
  nb_ytd: 0,
  renewals_ytd: 0,
  other_ytd: 0,
};

export function toAmount(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

/** Calendar year of an entry, or null when the date is missing/invalid. */
export function revenueYear(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

/**
 * Lifetime + YTD in one pass. `year` defaults to the current calendar year.
 * Entries without a usable date still count towards lifetime (they are awarded
 * history) but can never count towards a specific year.
 */
export function summarizeRevenueHistory(
  rows: RevenueHistoryRow[] | null | undefined,
  year: number = new Date().getUTCFullYear(),
  asOf: string = new Date().toISOString().slice(0, 10),
): RevenueSummary {
  const list = rows || [];
  const clients = new Set<string>();
  let lifetime = 0;
  let ytd = 0;
  let nb = 0, renewals = 0, other = 0;

  for (const r of list) {
    const amount = toAmount(r.amount);
    lifetime += amount;
    if (revenueYear(r.revenue_date) === year && r.revenue_date! <= asOf) {
      ytd += amount;
      if (r.revenue_type === "renewal" || r.source === "renewal_closure") renewals += amount;
      else if (r.revenue_type === "initial_sale") nb += amount;
      else other += amount;
    }
    if (r.client_id) clients.add(r.client_id);
  }

  return {
    lifetime_revenue: round2(lifetime),
    revenue_ytd: round2(ytd),
    revenue_entry_count: list.length,
    clients_with_revenue: clients.size,
    nb_ytd: round2(nb),
    renewals_ytd: round2(renewals),
    other_ytd: round2(other),
  };
}

export interface RevenueGroup {
  key: string;
  label: string;
  revenue: number;
  entry_count: number;
  client_count: number;
}

function groupBy(
  rows: RevenueHistoryRow[] | null | undefined,
  keyOf: (r: RevenueHistoryRow) => { key: string; label: string } | null,
): RevenueGroup[] {
  const map = new Map<string, RevenueGroup & { _clients: Set<string> }>();
  for (const r of rows || []) {
    const k = keyOf(r);
    if (!k) continue;
    let entry = map.get(k.key);
    if (!entry) {
      entry = { key: k.key, label: k.label, revenue: 0, entry_count: 0, client_count: 0, _clients: new Set() };
      map.set(k.key, entry);
    }
    entry.revenue += toAmount(r.amount);
    entry.entry_count += 1;
    if (r.client_id) entry._clients.add(r.client_id);
  }
  return [...map.values()]
    .map(({ _clients, ...g }) => ({ ...g, revenue: round2(g.revenue), client_count: _clients.size }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Historical awarded revenue grouped by the client's country. */
export function revenueByCountry(rows: RevenueHistoryRow[] | null | undefined): RevenueGroup[] {
  return groupBy(rows, (r) => {
    const c = (r.country || "").trim();
    return { key: c || "unknown", label: c || "Unknown" };
  });
}

/** Historical awarded revenue grouped by canonical partner. */
export function revenueByPartner(rows: RevenueHistoryRow[] | null | undefined): RevenueGroup[] {
  return groupBy(rows, (r) => {
    const id = (r.partner_uuid || "").trim();
    return { key: id || "hq_direct", label: (r.partner_name || "").trim() || (id ? "Unknown partner" : "HQ Direct") };
  });
}

export interface RevenueMonthPoint {
  month_key: string;
  month_label: string;
  revenue: number;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Historical awarded revenue per calendar month, ascending by month_key. */
export function revenueMonthly(rows: RevenueHistoryRow[] | null | undefined): RevenueMonthPoint[] {
  const map = new Map<string, number>();
  for (const r of rows || []) {
    if (!r.revenue_date) continue;
    const d = new Date(r.revenue_date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    map.set(key, (map.get(key) || 0) + toAmount(r.amount));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, revenue]) => ({
      month_key: key,
      month_label: `${MONTH_LABELS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`,
      revenue: round2(revenue),
    }));
}

/**
 * Won Deal Value — deliberately a SEPARATE function taking deals, so no call
 * site can accidentally feed revenue history into a sales metric (or vice versa).
 */
export interface WonDealLike {
  status?: string | null;
  value?: number | string | null;
}

export function wonDealValue(deals: WonDealLike[] | null | undefined): { value: number; count: number } {
  const won = (deals || []).filter((d) => d.status === "Won");
  return { value: round2(won.reduce((s, d) => s + toAmount(d.value), 0)), count: won.length };
}

/**
 * Share of a total, as an integer percentage. Use this instead of dividing
 * historical revenue by won-deal counts, which mixes concepts 1 and 2 and
 * produces meaningless "average deal size" figures for imported customers.
 */
export function shareOfTotal(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
