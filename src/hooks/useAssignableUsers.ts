import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AssignableUser {
  id: string;
  full_name: string | null;
  email: string;
  is_hq: boolean | null;
  partner_id: string | null;
}

/**
 * Returns users the current actor is allowed to assign to deals/renewals/etc.
 * - HQ users: all active users.
 * - Partner users: only active users in their partner organisation.
 * Mirrors the DB enforcement triggers (enforce_deal_assignment / enforce_renewal_assignment).
 */
export function useAssignableUsers() {
  const { isHQ, profile } = useAuth();
  const partnerId = profile?.partner_id ?? null;

  return useQuery({
    queryKey: ["assignable-users", { isHQ, partnerId }],
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, email, is_hq, partner_id")
        .eq("is_active", true)
        .order("full_name");
      if (!isHQ) {
        if (!partnerId) return [];
        q = q.eq("partner_id", partnerId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AssignableUser[];
    },
  });
}

/**
 * All profiles (active + inactive) — used for display resolution of historical
 * assignments where the assigned user may have been deactivated.
 */
export function useAllProfilesMap() {
  return useQuery({
    queryKey: ["all-profiles-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_active");
      if (error) throw error;
      const map = new Map<string, { full_name: string | null; email: string; is_active: boolean | null }>();
      (data || []).forEach((p: any) => map.set(p.id, p));
      return map;
    },
    staleTime: 60_000,
  });
}
