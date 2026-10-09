import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/loss-analysis";
import type { CurrentContract } from "@/lib/client-kpis";

export function useClientAggregates() {
  return useQuery({
    queryKey: ["client-aggregates"],
    queryFn: () => fetchAllPages<CurrentContract>((from, to) => supabase
      .from("contracts")
      .select("client_id, contract_value, currency, contract_start_date, contract_end_date")
      .order("id").range(from, to)),
  });
}
