import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LifecycleEvent {
  id: string;
  client_id: string | null;
  event_type: string;
  event_title: string;
  event_description: string | null;
  actor_id: string | null;
  actor_name: string | null;
  source_proposal_id: string | null;
  source_proposal_number: string | null;
  source_license_id: string | null;
  source_contract_id: string | null;
  source_renewal_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
  /** Proposed Phase 3 columns — optional until the review-only migration is applied. */
  effective_date?: string | null;
  imported_at?: string | null;
  occurred_at_known?: boolean | null;
}

export function useLifecycleEvents(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["lifecycle-events", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lifecycle_events")
        .select("*")
        .eq("client_id", clientId!)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data || []) as LifecycleEvent[];
    },
  });
}
