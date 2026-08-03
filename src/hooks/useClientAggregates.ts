import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ClientAggregates {
  totalContractValue: number;
  overdue: number;
}

export function useClientAggregates() {
  return useQuery({
    queryKey: ["client-aggregates"],
    queryFn: async () => {
      const nowStr = new Date().toISOString().split("T")[0];

      // Fetch all contracts for value sum and end date analysis
      const { data: contracts, error: cErr } = await supabase
        .from("contracts")
        .select("total_value, contract_end_date");
      if (cErr) throw cErr;

      // Fetch license end dates
      const { data: licenses, error: lErr } = await supabase
        .from("licenses")
        .select("license_end_date, sat_end_date");
      if (lErr) throw lErr;

      let totalContractValue = 0;
      let overdue = 0;

      // Aggregate contract values and count overdue components
      for (const c of contracts || []) {
        totalContractValue += Number(c.total_value || 0);
        if (c.contract_end_date && c.contract_end_date < nowStr) overdue++;
      }

      // Also count license and SAT end dates as overdue components
      for (const l of licenses || []) {
        for (const dateField of [l.license_end_date, l.sat_end_date]) {
          if (dateField && dateField < nowStr) overdue++;
        }
      }

      return { totalContractValue, overdue } as ClientAggregates;
    },
  });
}
