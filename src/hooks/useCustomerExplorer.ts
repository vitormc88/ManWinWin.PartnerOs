import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExplorerClient } from "@/lib/customer-explorer";

export function useCustomerExplorer() {
  return useQuery({
    queryKey: ["customer-explorer"],
    queryFn: async (): Promise<ExplorerClient[]> => {
      // Dedicated projection with RLS. Never fall back to clients.select('*').
      // Regenerate Supabase types after installing the reviewed SQL.
      const { data, error } = await supabase.from("customer_explorer_directory" as never)
        .select("id,name,country,sector,active,partner,contact_name,contact_email")
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as ExplorerClient[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
