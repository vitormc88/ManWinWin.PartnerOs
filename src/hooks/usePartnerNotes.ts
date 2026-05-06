import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PartnerNoteType = "Meeting" | "Internal Note" | "Follow-up";

export interface PartnerNote {
  id: string;
  partner_id: string;
  content: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
  note_type: PartnerNoteType;
  next_actions: string | null;
}

export function usePartnerNotes(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["partner-notes", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];
      const { data, error } = await supabase
        .from("partner_notes" as any)
        .select("*")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PartnerNote[];
    },
    enabled: !!partnerId,
  });
}

export function useAddPartnerNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ partner_id, content }: { partner_id: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      let authorName: string | null = null;
      if (user?.id) {
        const { data: prof } = await supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle();
        authorName = (prof as any)?.full_name || (prof as any)?.email || user.email || null;
      }
      const { data, error } = await supabase
        .from("partner_notes" as any)
        .insert({ partner_id, content, author_id: user?.id ?? null, author_name: authorName })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["partner-notes", vars.partner_id] });
    },
  });
}

export function useDeletePartnerNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; partner_id: string }) => {
      const { error } = await supabase.from("partner_notes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["partner-notes", vars.partner_id] });
    },
  });
}
