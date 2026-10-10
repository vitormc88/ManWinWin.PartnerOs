import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PartnerModel } from "@/hooks/usePartnerGrowth";

export type Pathway = "CMSC" | "CMAR" | "CMAI";
export type PreparationStatus = "not_started" | "planned" | "learning" | "assessment_needed";
export interface ActivationPlan {
  prospect_id: string;
  target_model: PartnerModel | null;
  hq_activation_owner: string | null;
  kickoff_objective: string;
  first_value_milestone: string;
  enablement_plan: string;
  commercial_handoff_notes: string;
  legal_review_status: "pending" | "approved";
  legal_review_reference: string | null;
  legal_reviewed_by: string | null;
  legal_reviewed_at: string | null;
  readiness_status: "planning" | "ready_for_handoff";
  handoff_approved_by: string | null;
  handoff_approved_at: string | null;
  updated_at: string;
}
export interface PathwayPlan {
  prospect_id: string;
  pathway: Pathway;
  preparation_status: PreparationStatus;
  readiness_notes: string;
  updated_at: string;
}
export type ActivationInput = Pick<ActivationPlan,
  "target_model" | "hq_activation_owner" | "kickoff_objective" |
  "first_value_milestone" | "enablement_plan" | "commercial_handoff_notes" |
  "legal_review_reference">;

const root = ["partner-growth"];
const check = (error: { message: string } | null) => { if (error) throw error; };

export function useActivationPlan(prospectId?: string) {
  return useQuery({
    queryKey: [...root, "activation", prospectId],
    enabled: !!prospectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospect_activation_plans" as any)
        .select("*").eq("prospect_id", prospectId!).maybeSingle();
      check(error);
      return data as unknown as ActivationPlan | null;
    },
  });
}
export function useCapabilityPlans(prospectId?: string) {
  return useQuery({
    queryKey: [...root, "capabilities", prospectId],
    enabled: !!prospectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospect_capability_plans" as any)
        .select("*").eq("prospect_id", prospectId!);
      check(error);
      return (data ?? []) as unknown as PathwayPlan[];
    },
  });
}
export function useSaveActivationPlan(prospectId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { values: ActivationInput; exists: boolean }) => {
      if (!user?.id) throw new Error("Authentication required");
      if (!input.exists) {
        const { error } = await supabase.from("partner_prospect_activation_plans" as any)
          .insert({ ...input.values, prospect_id: prospectId, created_by: user.id });
        check(error);
      } else {
        const { error } = await supabase.from("partner_prospect_activation_plans" as any)
          .update(input.values).eq("prospect_id", prospectId);
        check(error);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useApproveLegalReview(prospectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (legal_review_reference: string) => {
      const { error } = await supabase.from("partner_prospect_activation_plans" as any)
        .update({ legal_review_status: "approved", legal_review_reference })
        .eq("prospect_id", prospectId).eq("legal_review_status", "pending");
      check(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useApproveActivationHandoff(prospectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("partner_prospect_activation_plans" as any)
        .update({ readiness_status: "ready_for_handoff" })
        .eq("prospect_id", prospectId).eq("readiness_status", "planning");
      check(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useSaveCapabilityPlan(prospectId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pathway: Pathway; preparation_status: PreparationStatus; readiness_notes: string }) => {
      if (!user?.id) throw new Error("Authentication required");
      const { error } = await supabase.from("partner_prospect_capability_plans" as any)
        .upsert({ ...input, prospect_id: prospectId, updated_by: user.id }, { onConflict: "prospect_id,pathway" });
      check(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
