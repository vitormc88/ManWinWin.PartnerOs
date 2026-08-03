import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCommissions() {
  return useQuery({
    queryKey: ["commissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commissions")
        .select("*, deals(company_name, country)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDealRegistrations() {
  return useQuery({
    queryKey: ["deal_registrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_registrations")
        .select("*, deals!deal_registrations_deal_id_fkey(company_name, country, expected_value, partner_id, created_at)")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDealContacts(dealId: string | undefined) {
  return useQuery({
    queryKey: ["deal_contacts", dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from("deal_contacts")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });
}

export function useDealTasks(dealId: string | undefined) {
  return useQuery({
    queryKey: ["deal_tasks", dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from("deal_tasks")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });
}

export function useDealActivities(dealId: string | undefined) {
  return useQuery({
    queryKey: ["deal_activities", dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from("deal_activities")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });
}
