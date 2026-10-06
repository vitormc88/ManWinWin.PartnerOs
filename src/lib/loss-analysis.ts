/**
 * Loss Analysis v1 — pure helpers (read-only analytics).
 * Opportunities: deals with status Lost, joined 1:1 with opportunity_loss_details.
 * Renewals: FULL historical explicit renewals with status Lost OR outcome lost (one row per cycle).
 */
import { authDealValue } from "@/lib/analytics-corrections";

export const NO_PARTNER = "__none__";
export const MISSING = "Not recorded";

export interface LossFilters {
  from?: Date | null; // inclusive local day start
  to?: Date | null; // inclusive local day end
  partnerId?: string | null; // NO_PARTNER = HQ Direct / Unassigned
  ownerKey?: string | null; // "u:<uuid>" | "t:<legacy text>"
}

export interface LossRow {
  kind: "opportunity" | "renewal";
  id: string;
  name: string;
  partnerId: string | null;
  ownerKey: string | null;
  ownerUserId: string | null;
  ownerText: string | null;
  lostAt: string | null;
  value: number;
  valueMissing: boolean;
  category: string | null;
  reasons: string[];
  notes: string | null;
  competitor: string | null;
}

export function ownerKeyOf(userId: string | null | undefined, text: string | null | undefined): string | null {
  if (userId) return `u:${userId}`;
  const t = (text ?? "").trim();
  return t ? `t:${t}` : null;
}

export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

export function buildOpportunityRows(deals: any[], details: any[], reasons: any[]): LossRow[] {
  const detailByDeal = new Map<string, any>();
  details.forEach((d) => { if (!detailByDeal.has(d.deal_id)) detailByDeal.set(d.deal_id, d); });
  const reasonsByDetail = new Map<string, Set<string>>();
  reasons.forEach((r) => {
    const s = reasonsByDetail.get(r.loss_detail_id) ?? new Set<string>();
    const v = (r.reason ?? "").trim();
    if (v) s.add(v);
    reasonsByDetail.set(r.loss_detail_id, s);
  });
  const seen = new Set<string>();
  return deals.filter((d) => d.status === "Lost" && !seen.has(d.id) && seen.add(d.id)).map((d) => {
    const det = detailByDeal.get(d.id);
    const value = authDealValue(d);
    const comp = det ? (det.competitor_name === "Other" ? det.competitor_other : det.competitor_name) : null;
    return {
      kind: "opportunity" as const,
      id: d.id,
      name: d.company_name || "Unnamed opportunity",
      partnerId: d.partner_id || null,
      ownerKey: ownerKeyOf(d.assigned_user_id, d.assigned_salesperson),
      ownerUserId: d.assigned_user_id || null,
      ownerText: d.assigned_salesperson || null,
      // Workflow writes details.lost_at at Mark-as-Lost; deals.lost_at is the fallback.
      lostAt: det?.lost_at || d.lost_at || null,
      value,
      valueMissing: value <= 0,
      category: (det?.loss_category ?? "").trim() || null,
      reasons: det ? [...(reasonsByDetail.get(det.id) ?? [])] : [],
      notes: det?.notes || null,
      competitor: comp || null,
    };
  });
}

export function isRenewalLost(r: { status?: string | null; outcome?: string | null }): boolean {
  return (r.status ?? "").toLowerCase() === "lost" || (r.outcome ?? "").toLowerCase() === "lost";
}

/** Estimated value lost: pre-close estimated value only (final_value is 0 on loss and is ignored). */
export function renewalEstimatedLost(r: any): number {
  const v = Number(r.estimated_value ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function buildRenewalRows(renewals: any[], clientNames: Map<string, string>): LossRow[] {
  const seen = new Set<string>();
  return renewals.filter((r) => isRenewalLost(r) && !seen.has(r.id) && seen.add(r.id)).map((r) => {
    const value = renewalEstimatedLost(r);
    return {
      kind: "renewal" as const,
      id: r.id,
      name: clientNames.get(r.client_id) || "Unknown client",
      partnerId: r.partner_uuid || r.partner_id || null,
      ownerKey: ownerKeyOf(r.assigned_user_id, r.assigned_owner),
      ownerUserId: r.assigned_user_id || null,
      ownerText: r.assigned_owner || null,
      lostAt: r.closed_at || null,
      value,
      valueMissing: value <= 0,
      category: (r.loss_reason ?? "").trim() || null,
      reasons: [],
      notes: r.closing_notes || null,
      competitor: null,
    };
  });
}

export function applyLossFilters(rows: LossRow[], f: LossFilters) {
  const bounded = !!(f.from || f.to);
  let undatedExcluded = 0;
  const out = rows.filter((r) => {
    if (f.partnerId) {
      if (f.partnerId === NO_PARTNER ? !!r.partnerId : r.partnerId !== f.partnerId) return false;
    }
    if (f.ownerKey && r.ownerKey !== f.ownerKey) return false;
    if (bounded) {
      if (!r.lostAt) { undatedExcluded++; return false; }
      const t = new Date(r.lostAt).getTime();
      if (f.from && t < f.from.getTime()) return false;
      if (f.to && t > f.to.getTime()) return false;
    }
    return true;
  });
  return { rows: out, undatedExcluded };
}

export function dayStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function dayEnd(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export interface Dist { label: string; count: number; value: number }

/** Category distribution: one bucket per row (distinct entity); value is safe to sum. */
export function categoryDistribution(rows: LossRow[]): Dist[] {
  const m = new Map<string, Dist>();
  rows.forEach((r) => {
    const k = r.category ?? MISSING;
    const e = m.get(k) ?? { label: k, count: 0, value: 0 };
    e.count++; e.value += r.value; m.set(k, e);
  });
  return [...m.values()].sort((a, b) => b.count - a.count);
}

/** Reason distribution: distinct entities per reason; counts may sum above row count. No values. */
export function reasonDistribution(rows: LossRow[]): { label: string; count: number }[] {
  const m = new Map<string, number>();
  rows.forEach((r) => new Set(r.reasons).forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)));
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function lossSummary(rows: LossRow[]) {
  const explained = rows.filter((r) => !!r.category).length;
  return {
    count: rows.length,
    value: rows.reduce((s, r) => s + r.value, 0),
    valueMissing: rows.filter((r) => r.valueMissing).length,
    explained,
    missingCategory: rows.length - explained,
    missingReasons: rows.filter((r) => r.reasons.length === 0).length,
    coverage: rows.length ? Math.round((explained / rows.length) * 100) : null,
  };
}
