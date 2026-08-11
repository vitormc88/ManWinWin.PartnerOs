import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RenewalOutcome } from "@/lib/renewal-closing";
import { renewalClosureRefreshKeys } from "@/lib/renewal-closing";

const RECURRING_EXCLUDED = new Set(["one_time", "one-time", "once"]);

export interface RenewalClosureContext {
  proposal: any | null;
  contract: any | null;
  previousRecurring: number;
  hasContract: boolean;
}

/**
 * Everything the closing dialog needs to preview the outcome:
 * the latest renewal proposal, the contract being renewed and the
 * currently contracted recurring value (annualized contract lines).
 */
export function useRenewalClosureContext(
  renewalId: string | null | undefined,
  clientId: string | null | undefined,
  contractId?: string | null,
  enabled = true
) {
  return useQuery<RenewalClosureContext>({
    queryKey: ["renewal-closure-context", renewalId, clientId, contractId],
    enabled: !!renewalId && !!clientId && enabled,
    queryFn: async () => {
      const { data: proposal, error: pErr } = await supabase
        .from("proposals")
        .select("*")
        .eq("renewal_id", renewalId!)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pErr) throw pErr;

      let contract: any = null;
      if (contractId) {
        const { data } = await supabase.from("contracts").select("*").eq("id", contractId).maybeSingle();
        contract = data ?? null;
      }
      if (!contract) {
        const { data } = await supabase
          .from("contracts")
          .select("*")
          .eq("client_id", clientId!)
          .order("contract_end_date", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        contract = data ?? null;
      }

      let previousRecurring = 0;
      if (contract?.id) {
        const { data: lines } = await supabase
          .from("contract_lines")
          .select("amount, billing_frequency")
          .eq("contract_id", contract.id);
        previousRecurring = (lines || []).reduce((sum: number, l: any) => {
          const freq = String(l.billing_frequency || "annual").toLowerCase();
          return RECURRING_EXCLUDED.has(freq) ? sum : sum + Number(l.amount || 0);
        }, 0);
        if (previousRecurring === 0) {
          previousRecurring = Number(contract.contract_value ?? contract.total_value ?? 0);
        }
      }

      return { proposal: proposal ?? null, contract, previousRecurring, hasContract: !!contract?.id };
    },
  });
}

export interface CloseRenewalInput {
  renewalId: string;
  clientId?: string | null;
  outcome: RenewalOutcome;
  proposalId?: string | null;
  closingNotes?: string | null;
  lossReason?: string | null;
  effectiveDate?: string | null;
  nextRenewalDate?: string | null;
}

/**
 * Closes a renewal through the transactional `close_renewal` RPC.
 * The server performs authorization, validation, contract update,
 * next-cycle creation, history and audit in a single transaction.
 */
export function useCloseRenewal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CloseRenewalInput) => {
      const { data, error } = await supabase.rpc("close_renewal", {
        _renewal_id: input.renewalId,
        _outcome: input.outcome,
        _proposal_id: input.proposalId ?? null,
        _closing_notes: input.closingNotes ?? null,
        _loss_reason: input.lossReason ?? null,
        _effective_date: input.effectiveDate ?? null,
        _next_renewal_date: input.nextRenewalDate ?? null,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_data, input) => {
      for (const key of renewalClosureRefreshKeys(input.renewalId, input.clientId)) {
        qc.invalidateQueries({ queryKey: key });
      }
      qc.invalidateQueries({ queryKey: ["renewal-closure-context"] });
    },
  });
}

/** Human-readable message for the errors raised by `close_renewal`. */
export function closeRenewalErrorMessage(error: any): string {
  const raw = String(error?.message || error || "");
  if (raw.includes("NOT_AUTHORIZED")) return "You don't have permission to close renewals for this client.";
  if (raw.includes("RENEWAL_CLOSED")) return "This renewal is already closed.";
  if (raw.includes("PROPOSAL_NOT_ELIGIBLE")) return "The renewal proposal must be Ready or later before closing.";
  if (raw.includes("VARIANT_UNRESOLVED")) return "Resolve the commercial variant on the proposal before closing.";
  if (raw.includes("PROPOSAL_VALUE_MISSING")) return "The renewal proposal has no commercial value.";
  if (raw.includes("PROPOSAL_REQUIRED")) return "Create the renewal proposal before closing as Renewed.";
  if (raw.includes("PROPOSAL_NOT_LINKED")) return "That proposal does not belong to this renewal.";
  if (raw.includes("CONTRACT_NOT_FOUND")) return "No contract found to renew for this client.";
  if (raw.includes("LOSS_REASON_REQUIRED")) return "A loss reason is required to close a renewal as Lost.";
  if (raw.includes("INVALID_NEXT_DATE")) return "The next renewal date must be after the effective date.";
  if (raw.includes("duplicate key") && raw.includes("previous_renewal_id"))
    return "A next renewal cycle already exists for this renewal.";
  return raw.replace(/^[A-Z_]+:\s*/, "") || "Could not close this renewal.";
}
