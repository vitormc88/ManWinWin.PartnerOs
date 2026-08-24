import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type DiscoveryRecord = Tables<"discovery_records">;
export type DiscoveryStakeholder = Tables<"discovery_stakeholders">;

export type DiscoveryParent = { leadId?: string | null; dealId?: string | null };

function parentKey(p: DiscoveryParent) {
  return ["discovery_record", p.dealId || null, p.leadId || null] as const;
}

/**
 * One canonical discovery record per commercial journey. The Opportunity copy
 * wins once it exists; otherwise the Lead record is used so nothing is lost at
 * conversion.
 */
export function useDiscoveryRecord(parent: DiscoveryParent) {
  const enabled = !!(parent.dealId || parent.leadId);
  return useQuery({
    queryKey: parentKey(parent),
    enabled,
    queryFn: async (): Promise<DiscoveryRecord | null> => {
      if (parent.dealId) {
        const { data, error } = await supabase
          .from("discovery_records")
          .select("*")
          .eq("deal_id", parent.dealId)
          .maybeSingle();
        if (error) throw error;
        if (data) return data as DiscoveryRecord;
      }
      if (parent.leadId) {
        const { data, error } = await supabase
          .from("discovery_records")
          .select("*")
          .eq("lead_id", parent.leadId)
          .maybeSingle();
        if (error) throw error;
        return (data as DiscoveryRecord) ?? null;
      }
      return null;
    },
  });
}

export function useSaveDiscovery(parent: DiscoveryParent) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id?: string | null;
      patch: Partial<DiscoveryRecord>;
    }) => {
      if (id) {
        const { data, error } = await supabase
          .from("discovery_records")
          .update(patch as never)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data as DiscoveryRecord;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("discovery_records")
        .insert({
          ...(patch as Record<string, unknown>),
          lead_id: parent.leadId ?? null,
          deal_id: parent.dealId ?? null,
          created_by: userData.user?.id ?? null,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as DiscoveryRecord;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parentKey(parent) }),
  });
}

/** Carries the lead's discovery record onto the converted opportunity. */
export function useAttachDiscoveryToDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, dealId }: { leadId: string; dealId: string }) => {
      const { data: existing } = await supabase
        .from("discovery_records")
        .select("id")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (!existing) return null;
      const { error } = await supabase
        .from("discovery_records")
        .update({ deal_id: dealId })
        .eq("id", existing.id);
      if (error) throw error;
      return existing.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discovery_record"] }),
  });
}

export function useDiscoveryStakeholders(discoveryId: string | undefined) {
  return useQuery({
    queryKey: ["discovery_stakeholders", discoveryId],
    enabled: !!discoveryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovery_stakeholders")
        .select("*")
        .eq("discovery_id", discoveryId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as DiscoveryStakeholder[];
    },
  });
}

export function useSaveStakeholder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<DiscoveryStakeholder> & { discovery_id: string; full_name: string }) => {
      if (input.id) {
        const { error } = await supabase
          .from("discovery_stakeholders")
          .update(input as never)
          .eq("id", input.id);
        if (error) throw error;
        return input.discovery_id;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("discovery_stakeholders")
        .insert({ ...(input as Record<string, unknown>), created_by: userData.user?.id ?? null } as never);
      if (error) throw error;
      return input.discovery_id;
    },
    onSuccess: (id) => qc.invalidateQueries({ queryKey: ["discovery_stakeholders", id] }),
  });
}

export function useDeleteStakeholder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, discoveryId }: { id: string; discoveryId: string }) => {
      const { error } = await supabase.from("discovery_stakeholders").delete().eq("id", id);
      if (error) throw error;
      return discoveryId;
    },
    onSuccess: (id) => qc.invalidateQueries({ queryKey: ["discovery_stakeholders", id] }),
  });
}
