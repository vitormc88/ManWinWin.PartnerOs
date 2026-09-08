import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeDiscountOverride, type DiscountOverrides } from "@/lib/proposal-discount-policy";

/**
 * Per-partner configurable proposal discount limits (HQ Admin managed).
 *
 * Backward compatible on purpose: if `partner_discount_limits` has not been
 * deployed to the current environment yet, reads resolve to `null`
 * ("use default") instead of failing, so existing limits keep working.
 */
export const PARTNER_DISCOUNT_LIMITS_TABLE = "partner_discount_limits";

export interface PartnerDiscountLimitsRow {
  partner_id: string;
  max_software_discount_pct: number | null;
  max_services_discount_pct: number | null;
}

/** True when the error means "this table/column does not exist here yet". */
export function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code || "";
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") return true;
  return /does not exist|schema cache/i.test(error.message || "");
}

export function toDiscountOverrides(row: PartnerDiscountLimitsRow | null | undefined): DiscountOverrides {
  return {
    software: normalizeDiscountOverride(row?.max_software_discount_pct),
    services: normalizeDiscountOverride(row?.max_services_discount_pct),
  };
}

export function usePartnerDiscountLimits(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["partner_discount_limits", partnerId],
    enabled: !!partnerId,
    queryFn: async (): Promise<PartnerDiscountLimitsRow | null> => {
      if (!partnerId) return null;
      const { data, error } = await (supabase as any)
        .from(PARTNER_DISCOUNT_LIMITS_TABLE)
        .select("partner_id, max_software_discount_pct, max_services_discount_pct")
        .eq("partner_id", partnerId)
        .maybeSingle();
      if (error) {
        if (isMissingSchemaError(error)) return null;
        throw error;
      }
      return (data as PartnerDiscountLimitsRow) ?? null;
    },
  });
}

/** HQ Admin only (also enforced server-side by RLS). */
export function useSavePartnerDiscountLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PartnerDiscountLimitsRow) => {
      const payload = {
        partner_id: input.partner_id,
        max_software_discount_pct: normalizeDiscountOverride(input.max_software_discount_pct),
        max_services_discount_pct: normalizeDiscountOverride(input.max_services_discount_pct),
      };
      const { data, error } = await (supabase as any)
        .from(PARTNER_DISCOUNT_LIMITS_TABLE)
        .upsert(payload, { onConflict: "partner_id" })
        .select("partner_id, max_software_discount_pct, max_services_discount_pct")
        .single();
      if (error) throw error;
      return data as PartnerDiscountLimitsRow;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["partner_discount_limits", data.partner_id] });
    },
  });
}
