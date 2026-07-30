import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ContractLineWritePayload } from "@/lib/contract-line-payload";

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

export function useCreateContractLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ContractLineWritePayload) => {
      const { data, error } = await supabase
        .from("contract_lines" as any)
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ContractLine;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-lines"] });
      qc.invalidateQueries({ queryKey: ["client-commercial-intelligence"] });
    },
  });
}

export function useUpdateContractLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: ContractLineWritePayload & { id: string }) => {
      const { error } = await supabase
        .from("contract_lines" as any)
        .update(payload as any)
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-lines"] });
      qc.invalidateQueries({ queryKey: ["client-commercial-intelligence"] });
    },
  });
}

export function useDeleteContractLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contract_lines" as any).delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-lines"] });
      qc.invalidateQueries({ queryKey: ["client-commercial-intelligence"] });
    },
  });
}
