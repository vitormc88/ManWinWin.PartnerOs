import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type IncomingLead = Tables<"incoming_leads"> & {
  partners?: { id: string; company_name: string; country: string | null } | null;
};

export const LEAD_STATUSES = [
  "New",
  "Assigned",
  "In Review",
  "Contacted",
  "Qualified",
  "Rejected",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function useIncomingLeads() {
  return useQuery({
    queryKey: ["incoming_leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incoming_leads")
        .select("*, partners:linked_partner_id(id, company_name, country)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as IncomingLead[];
    },
  });
}

export function useIncomingLead(id: string | undefined) {
  return useQuery({
    queryKey: ["incoming_lead", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("incoming_leads")
        .select("*, partners:linked_partner_id(id, company_name, country)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as IncomingLead;
    },
    enabled: !!id,
  });
}

export function useUpdateIncomingLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Tables<"incoming_leads">>) => {
      const { data, error } = await supabase
        .from("incoming_leads")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["incoming_leads"] });
      qc.invalidateQueries({ queryKey: ["incoming_lead", data.id] });
    },
  });
}

export function useDeleteIncomingLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("incoming_leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incoming_leads"] }),
  });
}
