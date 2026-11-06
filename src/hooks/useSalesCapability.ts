import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SalesCapability = "none" | "view" | "edit" | "manager";

/** Server-resolved Direct Sales capability (active HQ + 'sales' module). Partners always resolve to "none". */
export function useSalesCapability() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["sales-capability", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_sales_capability");
      if (error) throw error;
      return (data as SalesCapability) ?? "none";
    },
  });
  const cap: SalesCapability = q.data ?? "none";
  return { ...q, capability: cap, hasAccess: cap !== "none", isManager: cap === "manager", canEdit: cap === "edit" || cap === "manager" };
}

/** Eligible Direct Sales owners (managers: all eligible; sellers: only themselves). */
export function useDirectSalesOwners(enabled = true) {
  return useQuery({
    queryKey: ["direct-sales-owners"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_direct_sales_owners");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });
}
