import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeDealHealth, type DealHealthResult } from "@/lib/deal-health";
import type { Deal } from "@/hooks/useDeals";

export interface DealHealthMapEntry extends DealHealthResult {
  lastActivityAt: Date | null;
  nextFollowUpAt: Date | null;
  hasOverdueTask: boolean;
  latestProposalAt: Date | null;
}

/**
 * Bulk-loads activity/task/proposal signals for the given deals and computes
 * health per deal. Returns a map keyed by deal id.
 */
export function useDealsHealth(deals: Deal[]) {
  const ids = deals.map(d => d.id).sort().join(",");
  return useQuery({
    queryKey: ["deals-health", ids],
    enabled: deals.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const dealIds = deals.map(d => d.id);
      const todayIso = new Date().toISOString().slice(0, 10);

      const [activitiesRes, tasksRes, proposalsRes] = await Promise.all([
        supabase
          .from("deal_activities")
          .select("deal_id, created_at")
          .in("deal_id", dealIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("deal_tasks")
          .select("deal_id, due_date, status, is_completed")
          .in("deal_id", dealIds),
        supabase
          .from("proposals")
          .select("lead_id, created_at")
          .in("lead_id", dealIds)
          .order("created_at", { ascending: false }),
      ]);

      const lastActivity = new Map<string, string>();
      (activitiesRes.data || []).forEach((a: any) => {
        if (!lastActivity.has(a.deal_id)) lastActivity.set(a.deal_id, a.created_at);
      });

      const nextFollowUp = new Map<string, string>();
      const overdue = new Set<string>();
      (tasksRes.data || []).forEach((t: any) => {
        const done = t.status === "Done" || t.is_completed === true;
        if (done) return;
        if (t.due_date) {
          if (t.due_date < todayIso) overdue.add(t.deal_id);
          else {
            const cur = nextFollowUp.get(t.deal_id);
            if (!cur || t.due_date < cur) nextFollowUp.set(t.deal_id, t.due_date);
          }
        }
      });

      const latestProposal = new Map<string, string>();
      (proposalsRes.data || []).forEach((p: any) => {
        if (!latestProposal.has(p.lead_id)) latestProposal.set(p.lead_id, p.created_at);
      });

      const map = new Map<string, DealHealthMapEntry>();
      for (const d of deals) {
        const stageEnteredAt = (d as any).stage_entered_at ? new Date((d as any).stage_entered_at) : null;
        const createdAt = new Date(d.created_at);
        const activityDate = lastActivity.get(d.id) ? new Date(lastActivity.get(d.id)!) : null;
        // last activity also includes implicit "stage changed" via stage_entered_at
        const effectiveActivity =
          activityDate && stageEnteredAt
            ? new Date(Math.max(activityDate.getTime(), stageEnteredAt.getTime()))
            : (activityDate || stageEnteredAt || createdAt);

        const followUpStr = nextFollowUp.get(d.id);
        const proposalStr = latestProposal.get(d.id);

        const result = computeDealHealth({
          stage: d.stage,
          status: d.status,
          stageEnteredAt,
          createdAt,
          lastActivityAt: effectiveActivity,
          nextFollowUpAt: followUpStr ? new Date(followUpStr) : null,
          hasOverdueTask: overdue.has(d.id),
          latestProposalAt: proposalStr ? new Date(proposalStr) : null,
          hasOwner: !!(d.assigned_salesperson && d.assigned_salesperson.trim()),
        });

        map.set(d.id, {
          ...result,
          lastActivityAt: effectiveActivity,
          nextFollowUpAt: followUpStr ? new Date(followUpStr) : null,
          hasOverdueTask: overdue.has(d.id),
          latestProposalAt: proposalStr ? new Date(proposalStr) : null,
        });
      }
      return map;
    },
  });
}
