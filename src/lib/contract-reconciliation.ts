/**
 * Contract reconciliation status.
 *
 * The structured contract lines are the ONLY calculation source. Imported
 * contracts also carry legacy header fields (S&AT value, invoiced value,
 * imported total). Those are preserved for audit and must never be added to,
 * compared against, or corrected by the current calculation.
 *
 * A warning is therefore raised only when the current structured lines fail to
 * reconcile with the CURRENT commercial header (`contract_value` /
 * `calculated_total`) — never because a preserved imported header differs.
 */

export interface ContractHeaderLike {
  contract_value?: number | null;
  calculated_total?: number | null;
  /** Preserved imported values — informational only. */
  sat_value?: number | null;
  invoiced_value?: number | null;
  total_value?: number | null;
  hosting_value?: number | null;
  mww_web_value?: number | null;
  is_imported?: boolean | null;
}

export interface ContractLineTotals {
  recurringArr: number;
  oneTimeValue: number;
  year1Value: number;
}

export type ContractReconciliationState = "reconciled" | "mismatch" | "no_lines";

export interface ContractReconciliation {
  state: ContractReconciliationState;
  label: string;
  /** True only for a genuine current-value mismatch. */
  isWarning: boolean;
  /** Signed difference against the current header, when one is set. */
  recurringDiff: number;
  year1Diff: number;
  detail: string;
}

const EPSILON = 0.01;
const n = (v: unknown) => Number(v ?? 0) || 0;
const close = (a: number, b: number) => Math.abs(a - b) < EPSILON;

/**
 * Reconciles the structured lines against the current contract header.
 * A header value of 0/null is treated as "not declared" and never fails.
 */
export function reconcileContract(
  contract: ContractHeaderLike | null | undefined,
  totals: ContractLineTotals,
  hasLines: boolean
): ContractReconciliation {
  if (!hasLines) {
    return {
      state: "no_lines",
      label: "No structured lines",
      isWarning: false,
      recurringDiff: 0,
      year1Diff: 0,
      detail: "Add contract lines to calculate the current commercial values.",
    };
  }

  const contractValue = n(contract?.contract_value);
  const calculatedTotal = n(contract?.calculated_total);

  const recurringDiff = contractValue > 0 ? totals.recurringArr - contractValue : 0;
  const year1Diff = calculatedTotal > 0 ? totals.year1Value - calculatedTotal : 0;

  const recurringOk = contractValue === 0 || close(totals.recurringArr, contractValue);
  const year1Ok = calculatedTotal === 0 || close(totals.year1Value, calculatedTotal);

  if (recurringOk && year1Ok) {
    return {
      state: "reconciled",
      label: "Current contract reconciled",
      isWarning: false,
      recurringDiff: 0,
      year1Diff: 0,
      detail: "Recurring and one-time lines match the current contract values.",
    };
  }

  const parts: string[] = [];
  if (!recurringOk) parts.push(`recurring differs by ${recurringDiff.toFixed(2)}`);
  if (!year1Ok) parts.push(`year 1 differs by ${year1Diff.toFixed(2)}`);

  return {
    state: "mismatch",
    label: "Needs reconciliation",
    isWarning: true,
    recurringDiff,
    year1Diff,
    detail: `Current structured lines do not match the current contract values — ${parts.join(" · ")}.`,
  };
}

export interface HistoricalSourceValue {
  key: string;
  label: string;
  amount: number;
}

export const HISTORICAL_SOURCE_EXPLANATION =
  "Preserved from the original imported contract for audit purposes. These values are not included in the current calculation.";

/** Preserved imported header values, labelled explicitly. Never recalculated. */
export function historicalSourceValues(
  contract: ContractHeaderLike | null | undefined
): HistoricalSourceValue[] {
  const out: HistoricalSourceValue[] = [];
  const push = (key: string, label: string, value: unknown) => {
    const amount = n(value);
    if (Math.abs(amount) > EPSILON) out.push({ key, label, amount });
  };
  push("sat_value", "Previous imported S&AT value", contract?.sat_value);
  push("hosting_value", "Previous imported hosting value", contract?.hosting_value);
  push("mww_web_value", "Previous imported web value", contract?.mww_web_value);
  push("invoiced_value", "Previous imported invoiced value", contract?.invoiced_value);
  push("total_value", "Previous imported total", contract?.total_value);
  return out;
}
