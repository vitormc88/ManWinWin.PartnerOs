/**
 * FIN-02: Business award contract integrity.
 *
 * UI-side preflight only. The award RPC remains the security/atomicity boundary.
 * Contract lines must match the saved priced line items; matching only the
 * grand total is insufficient (ten manual edits bypassed this in R1 TEST).
 */
export type AwardProposal = {
  product_family?: string | null;
  proposal_mode?: string | null;
  total_year_1?: number | string | null;
  total_recurring?: number | string | null;
};
export type AwardItem = {
  id?: string | null;
  item_code?: string | null;
  net_total?: number | string | null;
  gross_total?: number | string | null;
  discount_amount?: number | string | null;
  is_recurring?: boolean | null;
  apply_discount_to_renewal?: boolean | null;
};
export type AwardContractLine = {
  source_item_id?: string | null;
  amount?: number | string | null;
};

const toCents = (n: unknown): number => {
  if (n === null || n === undefined || n === "") return NaN;
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) : NaN;
};

export function businessAwardIntegrityBlocker(
  proposal: AwardProposal,
  items: AwardItem[],
  contractLines: AwardContractLine[],
): string | null {
  if (proposal.product_family !== "Business") return null;
  // Comparison proposals deliberately contain alternative price paths. They
  // need a separately verified per-mode award snapshot, not a false assertion
  // that the headline generic lines are an awarded option.
  if (proposal.proposal_mode === "compare_keepit_useit") {
    return "FIN02_COMPARE_REQUIRES_AWARDED_OPTION_SNAPSHOT: save the selected KeepIT/UseIT price as a separate proposal before award.";
  }
  if (!["keepit_only", "useit_only"].includes(proposal.proposal_mode || "")) {
    return "FIN02_UNRESOLVED_AWARDED_MODE";
  }
  if (!items.length || !contractLines.length) return "FIN02_MISSING_PRICED_LINES";

  let year1 = 0, nextRecurring = 0;
  const positive = new Map<string, number>();
  for (const item of items) {
    const net = toCents(item.net_total);
    const gross = toCents(item.gross_total);
    const discount = toCents(item.discount_amount ?? 0);
    if (!item.id || !Number.isFinite(net) || !Number.isFinite(gross) ||
        !Number.isFinite(discount) || net < 0 || gross < 0 ||
        discount < 0 || Math.abs((gross - discount) - net) > 1) {
      return "FIN02_INVALID_PRICED_LINE";
    }
    year1 += net;
    if (net > 0) {
      if (positive.has(item.id)) return "FIN02_DUPLICATE_SOURCE_ITEM";
      positive.set(item.id, net);
    }
    if (item.is_recurring) {
      // A temporary Year-1 reduction is NOT the recurring baseline. The
      // current contract_lines table cannot persist a separate next-cycle
      // amount. Block such awards until that data model is available.
      if (!item.apply_discount_to_renewal && gross !== net) {
        return "FIN02_TEMPORARY_RECURRING_DISCOUNT_NEEDS_CONTRACT_POLICY";
      }
      nextRecurring += item.apply_discount_to_renewal ? net : gross;
    }
  }

  const expectedYear1 = toCents(proposal.total_year_1);
  const expectedRecurring = toCents(proposal.total_recurring);
  if (!Number.isFinite(expectedYear1) || !Number.isFinite(expectedRecurring) ||
      Math.abs(year1 - expectedYear1) > 1 || Math.abs(nextRecurring - expectedRecurring) > 1) {
    return "FIN02_PROPOSAL_HEADER_LINE_MISMATCH";
  }

  if (positive.size !== contractLines.length) return "FIN02_CONTRACT_LINE_COUNT_MISMATCH";
  const seen = new Set<string>();
  let contractTotal = 0;
  for (const line of contractLines) {
    const id = line.source_item_id || "";
    const amount = toCents(line.amount);
    if (!id || !positive.has(id) || seen.has(id) || !Number.isFinite(amount)) {
      return "FIN02_CONTRACT_LINE_SOURCE_MISMATCH";
    }
    if (Math.abs(amount - positive.get(id)!) > 1) return "FIN02_CONTRACT_LINE_VALUE_MISMATCH";
    seen.add(id);
    contractTotal += amount;
  }
  if (Math.abs(contractTotal - expectedYear1) > 1) return "FIN02_CONTRACT_TOTAL_MISMATCH";
  return null;
}
