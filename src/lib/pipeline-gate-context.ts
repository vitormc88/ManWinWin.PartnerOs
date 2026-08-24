import { supabase } from "@/integrations/supabase/client";
import type { GateContext } from "./pipeline-gates";

/** Loads the commercial evidence a stage gate needs for one opportunity. */
export async function loadDealGateContext(deal: {
  id: string;
  assigned_user_id?: string | null;
  owner_name?: string | null;
  total_value?: number | string | null;
  expected_value?: number | string | null;
}): Promise<GateContext> {
  const { data: discovery } = await supabase
    .from("discovery_records")
    .select("*")
    .eq("deal_id", deal.id)
    .maybeSingle();

  const [{ data: stakeholders }, { data: nextSteps }, { count: proposalCount }] = await Promise.all([
    discovery
      ? supabase.from("discovery_stakeholders").select("buying_role, influence, attitude").eq("discovery_id", discovery.id)
      : Promise.resolve({ data: [] as { buying_role: string | null; influence: string | null; attitude: string | null }[] }),
    supabase.from("agreed_next_steps").select("*").eq("deal_id", deal.id),
    supabase.from("proposals").select("id", { count: "exact", head: true }).eq("deal_id", deal.id),
  ]);

  const value = Number(deal.total_value || 0) || Number(deal.expected_value || 0);

  return {
    discovery: (discovery as Record<string, unknown> | null) ?? null,
    stakeholders: stakeholders ?? [],
    nextSteps: (nextSteps as GateContext["nextSteps"]) ?? [],
    owner: deal.assigned_user_id ?? deal.owner_name ?? null,
    value,
    proposalCount: proposalCount ?? 0,
  };
}
