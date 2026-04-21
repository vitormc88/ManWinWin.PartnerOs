import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Proposal, ProposalItem, PricingRule } from "@/types/proposal";

/** Pricing catalog (HQ-managed) */
export function usePricingRules() {
  return useQuery({
    queryKey: ["pricing_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_rules")
        .select("*")
        .eq("active", true)
        .order("category", { ascending: true })
        .order("code", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as PricingRule[];
    },
  });
}

/** All pricing rules (incl. inactive) for admin UI */
export function useAllPricingRules() {
  return useQuery({
    queryKey: ["pricing_rules", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_rules")
        .select("*")
        .order("category", { ascending: true })
        .order("code", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as PricingRule[];
    },
  });
}

/** Proposals belonging to a lead */
export function useLeadProposals(leadId: string | undefined) {
  return useQuery({
    queryKey: ["proposals", "lead", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from("proposals")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Proposal[];
    },
    enabled: !!leadId,
  });
}

/** Single proposal */
export function useProposal(id: string | undefined) {
  return useQuery({
    queryKey: ["proposal", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("proposals")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Proposal | null;
    },
    enabled: !!id,
  });
}

export function useProposalItems(proposalId: string | undefined) {
  return useQuery({
    queryKey: ["proposal_items", proposalId],
    queryFn: async () => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from("proposal_items")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ProposalItem[];
    },
    enabled: !!proposalId,
  });
}

export function useDeleteProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, _v, ctx: any) => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}
