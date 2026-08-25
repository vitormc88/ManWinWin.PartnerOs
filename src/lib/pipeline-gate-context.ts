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
  const { data: discovery, error: discoveryError } = await supabase
    .from("discovery_records")
    .select("*")
    .eq("deal_id", deal.id)
    .maybeSingle();
  if (discoveryError) throw new Error(`Could not verify discovery evidence: ${discoveryError.message}`);

  const [stakeholderResult, nextStepResult, proposalResult] = await Promise.all([
    discovery
      ? supabase.from("discovery_stakeholders").select("buying_role, influence, attitude").eq("discovery_id", discovery.id)
      : Promise.resolve({ data: [] as { buying_role: string | null; influence: string | null; attitude: string | null }[] }),
    supabase.from("agreed_next_steps").select("*").eq("deal_id", deal.id),
    supabase.from("proposals").select("id", { count: "exact", head: true }).eq("deal_id", deal.id),
  ]);

  if ("error" in stakeholderResult && stakeholderResult.error) {
    throw new Error(`Could not verify stakeholder evidence: ${stakeholderResult.error.message}`);
  }
  if (nextStepResult.error) throw new Error(`Could not verify next-step evidence: ${nextStepResult.error.message}`);
  if (proposalResult.error) throw new Error(`Could not verify proposal evidence: ${proposalResult.error.message}`);

  const value = Number(deal.total_value || 0) || Number(deal.expected_value || 0);

  return {
    discovery: (discovery as Record<string, unknown> | null) ?? null,
    stakeholders: stakeholderResult.data ?? [],
    nextSteps: (nextStepResult.data as GateContext["nextSteps"]) ?? [],
    owner: deal.assigned_user_id ?? deal.owner_name ?? null,
    value,
    proposalCount: proposalResult.count ?? 0,
  };
}
