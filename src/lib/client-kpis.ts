import { daysToRenewal, isClosedRenewalStatus, type RenewalKpiRow } from "@/lib/renewal-kpi";

export interface CurrentContract {
  client_id: string;
  contract_value: number | null;
  currency: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
}

/** Current agreement amounts, never lifetime revenue or initial sale value. */
export function currentContractValues(contracts: CurrentContract[], visible: Set<string>, today = new Date()) {
  const totals: Record<string, number> = {};
  for (const c of contracts) {
    if (!visible.has(c.client_id)) continue;
    const start = daysToRenewal(c.contract_start_date, today);
    const end = daysToRenewal(c.contract_end_date, today);
    if (start !== null && start > 0 || end !== null && end < 0) continue;
    const currency = c.currency?.trim().toUpperCase() || "EUR";
    totals[currency] = (totals[currency] || 0) + Number(c.contract_value ?? 0);
  }
  return totals;
}

export function countOverdueClients(rows: RenewalKpiRow[], visible: Set<string>, today = new Date()) {
  const ids = new Set<string>();
  for (const r of rows) {
    if (!r.client_id || !visible.has(r.client_id) || isClosedRenewalStatus(r.status)) continue;
    const days = daysToRenewal(r.renewal_date, today);
    if (days !== null && days < 0) ids.add(r.client_id);
  }
  return ids.size;
}
