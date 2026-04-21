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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

/** Duplicate a proposal as a new version (latest version + 1 within the same lead) */
export function useDuplicateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (proposalId: string) => {
      // 1. Load source proposal + items
      const { data: src, error: e1 } = await supabase
        .from("proposals")
        .select("*")
        .eq("id", proposalId)
        .single();
      if (e1) throw e1;
      const { data: srcItems, error: e2 } = await supabase
        .from("proposal_items")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("sort_order");
      if (e2) throw e2;

      // 2. Compute next version
      const { data: siblings } = await supabase
        .from("proposals")
        .select("version")
        .eq("lead_id", src.lead_id)
        .order("version", { ascending: false })
        .limit(1);
      const nextVersion = (siblings?.[0]?.version || src.version || 1) + 1;

      // 3. Insert new proposal (Draft, new version, parent reference)
      const { id: _omit, created_at, updated_at, generated_at, docx_url, pdf_url, ...rest } = src as any;
      const { data: created, error: e3 } = await supabase
        .from("proposals")
        .insert({
          ...rest,
          version: nextVersion,
          status: "Draft",
          parent_proposal_id: src.id,
          docx_url: null,
          pdf_url: null,
          generated_at: null,
        })
        .select()
        .single();
      if (e3) throw e3;

      // 4. Clone items
      if (srcItems && srcItems.length > 0) {
        const cloned = srcItems.map((it: any) => {
          const { id: _i, created_at: _c, proposal_id: _p, ...itemRest } = it;
          return { ...itemRest, proposal_id: created.id };
        });
        const { error: e4 } = await supabase.from("proposal_items").insert(cloned);
        if (e4) throw e4;
      }

      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}
