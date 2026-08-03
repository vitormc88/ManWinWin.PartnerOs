import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ClientAggregates {
  totalContractValue: number;
  /** Distinct active clients with at least one commercial renewal in the next 30 days. */
  renewals30: number;
  overdue: number;
}

const CLOSED_RENEWAL_STATUSES = new Set(["won", "lost", "cancelled", "canceled"]);

export function useClientAggregates() {
  return useQuery({
    queryKey: ["client-aggregates"],
    queryFn: async () => {
      const now = new Date();
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);
      const nowStr = now.toISOString().split("T")[0];
      const in30Str = in30.toISOString().split("T")[0];

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

      // Commercial renewals — one renewal per client is the product rule, but
      // legacy rows can still exist per component, so we count DISTINCT clients.
      const { data: renewals, error: rErr } = await supabase
        .from("renewals")
        .select("client_id, renewal_date, status");
      if (rErr) throw rErr;

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

      const renewals30 = countClientsDueWithin(renewals || [], nowStr, in30Str);

      return { totalContractValue, renewals30, overdue } as ClientAggregates;
    },
  });
}

/** Distinct clients with ≥1 open renewal whose date falls within [from, to]. */
export function countClientsDueWithin(
  rows: { client_id?: string | null; renewal_date?: string | null; status?: string | null }[],
  fromStr: string,
  toStr: string
): number {
  const clients = new Set<string>();
  for (const r of rows) {
    if (!r.client_id || !r.renewal_date) continue;
    if (CLOSED_RENEWAL_STATUSES.has((r.status || "").toLowerCase())) continue;
    const d = r.renewal_date.slice(0, 10);
    if (d >= fromStr && d <= toStr) clients.add(r.client_id);
  }
  return clients.size;
}
