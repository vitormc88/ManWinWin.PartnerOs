import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type TargetAccountActivity = Tables<"target_account_activities">;

export function useTargetAccountActivities(accountId: string | undefined) {
  return useQuery({
    queryKey: ["target_account_activities", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("target_account_activities")
        .select("*")
        .eq("target_account_id", accountId!)
        .order("performed_at", { ascending: false });
      if (error) throw error;
      return data as TargetAccountActivity[];
    },
  });
}

export function useLogTargetAccountActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      target_account_id: string;
      channel: string;
      outcome: string;
      person_id?: string | null;
      notes?: string | null;
      performed_at?: string;
      performed_by?: string | null;
    }) => {
      const { error } = await supabase.from("target_account_activities").insert({
        ...input,
        performed_at: input.performed_at || new Date().toISOString(),
      });
      if (error) throw error;
      return input.target_account_id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["target_account_activities", id] });
      qc.invalidateQueries({ queryKey: ["target_account", id] });
      qc.invalidateQueries({ queryKey: ["target_accounts"] });
    },
  });
}

export function useDeleteTargetAccountActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accountId }: { id: string; accountId: string }) => {
      const { error } = await supabase.from("target_account_activities").delete().eq("id", id);
      if (error) throw error;
      return accountId;
    },
    onSuccess: (id) => qc.invalidateQueries({ queryKey: ["target_account_activities", id] }),
  });
}
