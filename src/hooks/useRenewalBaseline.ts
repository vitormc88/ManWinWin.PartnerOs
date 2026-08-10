/**
 * Renewals P0 — load the REAL commercial baseline behind a renewal.
 *
 * Reads only canonical identifiers coming from the renewal itself
 * (client_id, partner_uuid, contract_id, license_id) and never writes.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildRenewalBaseline, type RenewalBaseline } from "@/lib/renewal-baseline";

export interface UseRenewalBaselineResult {
  baseline: RenewalBaseline | null;
  isLoading: boolean;
  error: unknown;
}

export function useRenewalBaseline(renewalId: string | null | undefined): UseRenewalBaselineResult {
  const q = useQuery({
    queryKey: ["renewal_baseline", renewalId],
    enabled: !!renewalId,
    queryFn: async (): Promise<RenewalBaseline | null> => {
      const { data: renewal, error: rErr } = await supabase
        .from("renewals")
        .select("*")
        .eq("id", renewalId as string)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!renewal) return null;

      const clientId = (renewal as any).client_id as string | null;
      const contractId = (renewal as any).contract_id as string | null;
      const licenseId = (renewal as any).license_id as string | null;

      const [clientRes, contractRes, licenseRes] = await Promise.all([
        clientId
          ? supabase.from("clients").select("*").eq("id", clientId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        contractId
          ? supabase.from("contracts").select("*").eq("id", contractId).maybeSingle()
          : clientId
          ? supabase
              .from("contracts")
              .select("*")
              .eq("client_id", clientId)
              .order("contract_end_date", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        licenseId
          ? supabase.from("licenses").select("*").eq("id", licenseId).maybeSingle()
          : clientId
          ? supabase
              .from("licenses")
              .select("*")
              .eq("client_id", clientId)
              .order("license_end_date", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const contract = (contractRes as any)?.data ?? null;
      const license = (licenseRes as any)?.data ?? null;

      const [linesRes, modulesRes] = await Promise.all([
        contract?.id
          ? supabase.from("contract_lines").select("*").eq("contract_id", contract.id)
          : Promise.resolve({ data: [], error: null } as any),
        license?.id
          ? supabase.from("licensed_modules").select("*").eq("license_id", license.id)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      return buildRenewalBaseline({
        renewal,
        client: (clientRes as any)?.data ?? null,
        contract,
        contractLines: ((linesRes as any)?.data ?? []) as any[],
        license,
        licensedModules: ((modulesRes as any)?.data ?? []) as any[],
      });
    },
  });

  return { baseline: q.data ?? null, isLoading: q.isLoading, error: q.error };
}
