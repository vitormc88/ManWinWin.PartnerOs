import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { StrategicProposalSnapshot } from "@/lib/partner-growth-proposal";

export interface PartnerDocument {
  id: string; prospect_id: string; document_group_id: string; version: number;
  document_type: "strategic_proposal"; title: string; language: "en";
  content_snapshot: StrategicProposalSnapshot; status: "draft" | "approved";
  created_by: string; created_at: string; approved_by: string | null; approved_at: string | null;
}
const root = ["partner-growth"];
const check = (error: { message: string } | null) => { if (error) throw error; };

export function usePartnerDocuments(prospectId?: string) {
  return useQuery({
    queryKey: [...root, "documents", prospectId],
    enabled: !!prospectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_prospect_documents" as any)
        .select("*").eq("prospect_id", prospectId!).order("created_at", { ascending: false });
      check(error);
      return (data ?? []) as unknown as PartnerDocument[];
    },
  });
}
export function useSavePartnerDocument(prospectId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      snapshot: StrategicProposalSnapshot;
      previous?: PartnerDocument | null;
    }) => {
      if (!user?.id) throw new Error("Authentication required");
      const { data, error } = await supabase.from("partner_prospect_documents" as any)
        .insert({
          prospect_id: prospectId,
          document_group_id: input.previous?.document_group_id ?? crypto.randomUUID(),
          version: (input.previous?.version ?? 0) + 1,
          document_type: "strategic_proposal",
          title: input.snapshot.title, language: "en", content_snapshot: input.snapshot,
          status: "draft", created_by: user.id,
        }).select("*").single();
      check(error);
      return data as unknown as PartnerDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
export function useApprovePartnerDocument(prospectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => {
      const { data, error } = await supabase.from("partner_prospect_documents" as any)
        .update({ status: "approved" }).eq("id", docId).eq("prospect_id", prospectId)
        .eq("status", "draft").select("*").single();
      check(error);
      return data as unknown as PartnerDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}
