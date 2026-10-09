import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/loss-analysis";
import type { RevenueEntry } from "@/lib/dashboard-metrics";
import type { UnifiedTask } from "./useTasks";

export function useDashboardRevenue(enabled: boolean) {
  return useQuery({
    queryKey: ["revenue-history", "dashboard"],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      fetchAllPages<RevenueEntry>(
        (from, to) =>
          supabase
            .from("client_revenue_history" as any)
            .select(
              "id,client_id,partner_id,currency,amount,revenue_date,revenue_type,renewal_id",
            )
            .order("id")
            .range(from, to) as any,
      ),
  });
}
export function useDashboardTasks(
  enabled: boolean,
  isHQ: boolean,
  userId?: string,
) {
  return useQuery({
    queryKey: ["unified_tasks", "dashboard", isHQ, userId],
    enabled: enabled && !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from("unified_tasks" as any)
        .select(
          "id,title,source,related_route,related_type,related_entity_id,owner_user_id,owner_name,due_date,priority,priority_score,status",
        )
        .in("status", ["open", "in_progress", "waiting"]);
      if (!isHQ) query = query.eq("owner_user_id", userId!);
      return fetchAllPages<UnifiedTask>(
        (from, to) =>
          query
            .order("priority_score", { ascending: false })
            .order("id")
            .range(from, to) as any,
      );
    },
  });
}
export function useDashboardPartnerName(
  enabled: boolean,
  partnerId?: string | null,
) {
  return useQuery({
    queryKey: ["partner-name", partnerId],
    enabled: enabled && !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("company_name")
        .eq("id", partnerId!)
        .maybeSingle();
      if (error) throw error;
      return data?.company_name ?? null;
    },
  });
}
