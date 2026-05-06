import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Deal = Tables<"deals">;

export function useDeals(filters?: { stage?: string; partner_id?: string }) {
  return useQuery({
    queryKey: ["deals", filters],
    queryFn: async () => {
      let query = supabase.from("deals").select("*").order("created_at", { ascending: false });
      if (filters?.stage) query = query.eq("stage", filters.stage);
      if (filters?.partner_id) query = query.eq("partner_id", filters.partner_id);
      const { data, error } = await query;
      if (error) throw error;
      return data as Deal[];
    },
  });
}

export function useDeal(id: string | undefined) {
  return useQuery({
    queryKey: ["deal", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from("deals").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Deal;
    },
    enabled: !!id,
  });
}

export function useRenewals(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["renewals", filters],
    queryFn: async () => {
      // Fetch explicit renewal records
      let query = supabase.from("renewals").select("*").order("renewal_date");
      if (filters?.status) query = query.eq("status", filters.status);
      const { data: existing, error } = await query;
      if (error) throw error;

      const explicit = existing || [];

      // Build a set of already-covered (client_id + renewal_type) from explicit records
      const coveredKeys = new Set(
        explicit.map((r: any) => `${r.client_id}::${r.renewal_type}`)
      );

      // Derive renewal candidates from contracts and licenses
      const derived: any[] = [];

      // Batch-fetch all clients for partner_id lookup
      const { data: allClients } = await supabase
        .from("clients")
        .select("id, partner_id");
      const clientPartnerMap: Record<string, string | null> = {};
      (allClients || []).forEach((c: any) => {
        clientPartnerMap[c.id] = c.partner_id;
      });

      // Derive from contracts
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, client_id, contract_end_date, total_value");

      for (const c of contracts || []) {
        if (!c.contract_end_date) continue;
        const key = `${c.client_id}::Contract`;
        if (coveredKeys.has(key)) continue;

        const days = Math.ceil((new Date(c.contract_end_date).getTime() - Date.now()) / 86400000);
        let status = "Upcoming";
        if (days < 0) status = "Expired";
        else if (days <= 30) status = "Due Soon";

        derived.push({
          id: `derived-contract-${c.id}`,
          client_id: c.client_id,
          partner_id: clientPartnerMap[c.client_id] || null,
          renewal_type: "Contract",
          renewal_date: c.contract_end_date,
          estimated_value: c.total_value,
          status,
          priority: days < 0 ? "Critical" : days <= 30 ? "High" : "Medium",
          assigned_owner: null,
          notes: null,
        });
        coveredKeys.add(key);
      }

      // Derive from licenses
      const { data: licenses } = await supabase
        .from("licenses")
        .select("id, client_id, license_end_date, sat_end_date, sat_active");

      for (const l of licenses || []) {
        if (l.license_end_date) {
          const key = `${l.client_id}::License`;
          if (!coveredKeys.has(key)) {
            const days = Math.ceil((new Date(l.license_end_date).getTime() - Date.now()) / 86400000);
            let status = "Upcoming";
            if (days < 0) status = "Expired";
            else if (days <= 30) status = "Due Soon";

            derived.push({
              id: `derived-license-${l.id}`,
              client_id: l.client_id,
              partner_id: clientPartnerMap[l.client_id] || null,
              renewal_type: "License",
              renewal_date: l.license_end_date,
              estimated_value: null,
              status,
              priority: days < 0 ? "Critical" : days <= 30 ? "High" : "Medium",
              assigned_owner: null,
              notes: null,
            });
            coveredKeys.add(key);
          }
        }

        if (l.sat_end_date && l.sat_active) {
          const key = `${l.client_id}::SAT`;
          if (!coveredKeys.has(key)) {
            const days = Math.ceil((new Date(l.sat_end_date).getTime() - Date.now()) / 86400000);
            let status = "Upcoming";
            if (days < 0) status = "Expired";
            else if (days <= 30) status = "Due Soon";

            derived.push({
              id: `derived-sat-${l.id}`,
              client_id: l.client_id,
              partner_id: clientPartnerMap[l.client_id] || null,
              renewal_type: "SAT",
              renewal_date: l.sat_end_date,
              estimated_value: null,
              status,
              priority: days < 0 ? "Critical" : days <= 30 ? "High" : "Medium",
              assigned_owner: null,
              notes: null,
            });
            coveredKeys.add(key);
          }
        }
      }

      // Merge explicit + derived, sort by renewal_date
      const all = [...explicit, ...derived];
      all.sort((a: any, b: any) => (a.renewal_date || "").localeCompare(b.renewal_date || ""));
      return all;
    },
  });
}

export function useNotifications(enabled: boolean = true) {
  return useQuery({
    queryKey: ["notifications"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}
