import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CloseReadiness } from "@/lib/proposal-workflow";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [["proposals"], ["proposal"], ["renewals"], ["renewal-closure-context"], ["renewal-close-readiness"], ["client_commercial_intelligence"], ["client-commercial-intelligence"]]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args);

export function useValidateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { proposalId: string; differenceCategory?: string | null; differenceNote?: string | null }) => {
      const { data, error } = await rpc("validate_proposal", {
        _proposal_id: v.proposalId,
        _difference_category: v.differenceCategory ?? null,
        _difference_note: v.differenceNote ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useMarkProposalSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { proposalId: string; sentDate?: string | null; note?: string | null }) => {
      const { data, error } = await rpc("mark_proposal_sent", {
        _proposal_id: v.proposalId,
        _sent_date: v.sentDate ?? null,
        _method: "manual",
        _note: v.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRecordAcceptance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { proposalId: string; evidenceType: string; acceptanceDate: string; reference?: string; filePath?: string; notes?: string }) => {
      const { data, error } = await rpc("record_proposal_acceptance", {
        _proposal_id: v.proposalId,
        _evidence_type: v.evidenceType,
        _acceptance_date: v.acceptanceDate,
        _reference: v.reference || null,
        _file_path: v.filePath || null,
        _notes: v.notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRenewalCloseReadiness(renewalId: string | null | undefined, outcome: "renewed" | "lost", enabled = true) {
  return useQuery<CloseReadiness>({
    queryKey: ["renewal-close-readiness", renewalId, outcome],
    enabled: !!renewalId && enabled && !String(renewalId).startsWith("derived-"),
    queryFn: async () => {
      const { data, error } = await rpc("renewal_close_readiness", { _renewal_id: renewalId, _outcome: outcome, _proposal_id: null });
      if (error) throw error;
      return data as CloseReadiness;
    },
  });
}
