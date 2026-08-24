import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AgreedNextStep = Tables<"agreed_next_steps">;
export type NextStepParent = { leadId?: string | null; dealId?: string | null };

function key(p: NextStepParent) {
  return ["agreed_next_steps", p.dealId || null, p.leadId || null] as const;
}

export function useAgreedNextSteps(parent: NextStepParent) {
  const enabled = !!(parent.dealId || parent.leadId);
  return useQuery({
    queryKey: key(parent),
    enabled,
    queryFn: async (): Promise<AgreedNextStep[]> => {
      let q = supabase.from("agreed_next_steps").select("*");
      q = parent.dealId ? q.eq("deal_id", parent.dealId) : q.eq("lead_id", parent.leadId!);
      const { data, error } = await q.order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as AgreedNextStep[];
    },
  });
}

export function useSaveNextStep(parent: NextStepParent) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AgreedNextStep> & { title: string }) => {
      if (input.id) {
        const { error } = await supabase
          .from("agreed_next_steps")
          .update(input as never)
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("agreed_next_steps").insert({
        ...(input as Record<string, unknown>),
        lead_id: parent.leadId ?? null,
        deal_id: parent.dealId ?? null,
        created_by: userData.user?.id ?? null,
      } as never);
      if (error) throw error;
      return null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(parent) }),
  });
}

export function useCompleteNextStep(parent: NextStepParent) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "done" | "cancelled" | "open" }) => {
      const { error } = await supabase
        .from("agreed_next_steps")
        .update({
          status,
          completed_at: status === "done" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(parent) }),
  });
}

/** Moves the lead's next steps onto the converted opportunity. */
export function useCarryNextStepsToDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, dealId }: { leadId: string; dealId: string }) => {
      const { error } = await supabase
        .from("agreed_next_steps")
        .update({ deal_id: dealId })
        .eq("lead_id", leadId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agreed_next_steps"] }),
  });
}

export function useLogStageGateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entity_type: "lead" | "deal";
      lead_id?: string | null;
      deal_id?: string | null;
      from_stage?: string | null;
      to_stage: string;
      missing_evidence: string[];
      reason: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("stage_gate_overrides").insert({
        entity_type: input.entity_type,
        lead_id: input.lead_id ?? null,
        deal_id: input.deal_id ?? null,
        from_stage: input.from_stage ?? null,
        to_stage: input.to_stage,
        missing_evidence: input.missing_evidence,
        reason: input.reason,
        performed_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stage_gate_overrides"] }),
  });
}
