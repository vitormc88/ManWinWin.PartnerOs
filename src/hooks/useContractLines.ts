import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ContractLine {
  id: string;
  contract_id: string;
  client_id: string;
  line_type: string;
  description: string;
  related_license_id: string | null;
  related_module_id: string | null;
  related_plugin_id: string | null;
  amount: number;
  currency: string;
  billing_frequency: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

export function useContractLines(contractId: string | null | undefined) {
  return useQuery({
    queryKey: ["contract-lines", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_lines" as any)
        .select("*")
        .eq("contract_id", contractId!)
        .order("line_type");
      if (error) throw error;
      return (data || []) as unknown as ContractLine[];
    },
  });
}
