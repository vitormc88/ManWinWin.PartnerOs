/**
 * Sales Module v1 — shared Direct Sales data for the /sales/* screens.
 * Thin read models over the existing deals/proposals queries; RLS stays authoritative.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDeals, type Deal } from "@/hooks/useDeals";
import { isDirect } from "@/lib/commercial-scope";
import { authDealValue } from "@/lib/analytics-corrections";
import {
  isActivePipelineStage,
  getStageProbability,
  STUCK_THRESHOLD_DAYS,
} from "@/data/pipeline-stages";

export type DirectDeal = Deal;

/** All Direct (new_business) deals visible to the current user under RLS. */
export function useDirectDeals() {
  const q = useDeals();
  const deals = (q.data ?? []).filter((d) => isDirect(d as any));
  return { ...q, deals };
}

export type DirectProposal = {
  id: string;
  commercial_reference: string;
  client_name: string;
  status: string;
  total_year_1: number | null;
  created_at: string;
  deal_id: string | null;
};

/** Proposals linked to the given Direct deals. */
export function useDirectProposals(dealIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["sales-direct-proposals", dealIds],
    enabled: enabled && dealIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, commercial_reference, client_name, status, total_year_1, created_at, deal_id")
        .eq("source_type", "deal")
        .in("deal_id", dealIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DirectProposal[];
    },
  });
}

export const isOpenDeal = (d: DirectDeal) =>
  d.status === "Open" && isActivePipelineStage(d.stage);

export const dealProbability = (d: DirectDeal) =>
  d.probability ?? getStageProbability(d.stage);

export const weightedValue = (d: DirectDeal) =>
  (authDealValue(d) * dealProbability(d)) / 100;

export type AttentionReason = "overdue-close" | "stuck";

export type AttentionItem = { deal: DirectDeal; reason: AttentionReason; days: number };

/** Open deals whose expected close date passed or that have been stuck in stage. */
export function attentionItems(deals: DirectDeal[], now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const d of deals) {
    if (!isOpenDeal(d)) continue;
    if (d.expected_close_date) {
      const close = new Date(d.expected_close_date).getTime();
      if (close < now) {
        items.push({
          deal: d,
          reason: "overdue-close",
          days: Math.floor((now - close) / 86400000),
        });
        continue;
      }
    }
    const since = d.stage_entered_at ?? d.last_activity_at ?? d.created_at;
    const days = Math.floor((now - new Date(since).getTime()) / 86400000);
    if (days >= STUCK_THRESHOLD_DAYS) items.push({ deal: d, reason: "stuck", days });
  }
  return items.sort((a, b) => b.days - a.days);
}

/** Open deals most likely to close, by probability-weighted value. */
export function likelyToClose(deals: DirectDeal[], limit = 5): DirectDeal[] {
  return deals
    .filter(isOpenDeal)
    .map((d) => ({ d, w: weightedValue(d) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, limit)
    .map((x) => x.d);
}

export type OwnerStats = {
  ownerId: string | null;
  open: number;
  pipeline: number;
  weighted: number;
  won: number;
  wonValue: number;
  lost: number;
};

/** Per-owner aggregation for the manager cockpit / Performance screen. */
export function perOwnerStats(deals: DirectDeal[]): OwnerStats[] {
  const map = new Map<string | null, OwnerStats>();
  const row = (id: string | null): OwnerStats => {
    let r = map.get(id);
    if (!r) {
      r = { ownerId: id, open: 0, pipeline: 0, weighted: 0, won: 0, wonValue: 0, lost: 0 };
      map.set(id, r);
    }
    return r;
  };
  for (const d of deals) {
    const r = row(d.assigned_user_id ?? null);
    if (isOpenDeal(d)) {
      r.open += 1;
      r.pipeline += authDealValue(d);
      r.weighted += weightedValue(d);
    } else if (d.status === "Won") {
      r.won += 1;
      r.wonValue += authDealValue(d);
    } else if (d.status === "Lost") {
      r.lost += 1;
    }
  }
  return [...map.values()].sort((a, b) => b.pipeline - a.pipeline);
}
