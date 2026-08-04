import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_REVENUE_SUMMARY,
  RevenueSummary,
  RevenueHistoryRow,
  revenueByCountry,
  revenueByPartner,
  revenueMonthly,
  summarizeRevenueHistory,
  toAmount,
} from "@/lib/revenue-metrics";

const REVENUE_STALE_MS = 60_000;

/**
 * Historical billed revenue (`public.client_revenue_history`).
 *
 * All views below are `security_invoker=true`, so the table's own RLS policies
 * apply: HQ sees every row, a partner user sees only their own clients' rows.
 * No client-side partner filtering is applied (or needed) here.
 */

/** Compact summary: lifetime, YTD, entry count, distinct clients with revenue. */
export function useRevenueSummary(enabled = true) {
  return useQuery({
    queryKey: ["revenue-history", "summary"],
    enabled,
    staleTime: REVENUE_STALE_MS,
    queryFn: async (): Promise<RevenueSummary> => {
      const { data, error } = await supabase
        .from("v_client_revenue_summary" as any)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      const r: any = data || {};
      return {
        lifetime_revenue: toAmount(r.lifetime_revenue),
        revenue_ytd: toAmount(r.revenue_ytd),
        revenue_entry_count: toAmount(r.revenue_entry_count),
        clients_with_revenue: toAmount(r.clients_with_revenue),
      };
    },
    placeholderData: undefined,
  });
}

/** Raw (RLS-scoped) revenue entries enriched with client country + partner. */
export function useRevenueHistory(enabled = true) {
  return useQuery({
    queryKey: ["revenue-history", "entries"],
    enabled,
    staleTime: REVENUE_STALE_MS,
    queryFn: async (): Promise<RevenueHistoryRow[]> => {
      const { data, error } = await supabase
        .from("v_revenue_history_enriched" as any)
        .select("*");
      if (error) throw error;
      return (data || []).map((r: any) => ({
        client_id: r.client_id,
        partner_uuid: r.partner_uuid ?? null,
        partner_name: r.partner_name ?? null,
        country: r.country ?? null,
        amount: r.amount,
        revenue_date: r.revenue_date,
      }));
    },
  });
}

/** Historical revenue by country — never deal-derived. */
export function useHistoricalRevenueByCountry(enabled = true) {
  const q = useRevenueHistory(enabled);
  return { ...q, groups: revenueByCountry(q.data) };
}

/** Historical revenue by canonical partner — never deal-derived. */
export function useHistoricalRevenueByPartner(enabled = true) {
  const q = useRevenueHistory(enabled);
  return { ...q, groups: revenueByPartner(q.data) };
}

/** Historical revenue per calendar month. */
export function useHistoricalRevenueMonthly(enabled = true) {
  const q = useRevenueHistory(enabled);
  return { ...q, points: revenueMonthly(q.data) };
}

/** Summary derived client-side from the entries already in cache. */
export function summaryFromEntries(rows: RevenueHistoryRow[] | undefined): RevenueSummary {
  return rows ? summarizeRevenueHistory(rows) : EMPTY_REVENUE_SUMMARY;
}
