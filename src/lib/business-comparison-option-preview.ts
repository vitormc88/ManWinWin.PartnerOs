/**
 * FIN02 Gate5C — present both computed Business alternatives as a complete,
 * deterministic commercial PREVIEW. This output is not authorized/priced
 * evidence, never itself a contract, and cannot be used to bypass backend
 * approval/price-catalog policy.
 *
 * The server must recompute/verify against its trusted pricing catalog and
 * freeze the pair once the comparison revision becomes eligible (Ready).
 */
import type { BusinessEngineOutput, BusinessOptionTotals } from "./proposal-business-engine";
import {
  assertBusinessProposalTotals,
  buildBusinessProposalItemRows,
  businessPersistedTotals,
} from "./proposal-business-persistence";

export type ComparableOptionLine = {
  sort_order: number;
  item_code: string;
  item_name: string;
  category: string;
  qty: number;
  unit_price: number;
  frequency: string;
  gross_total: number;
  discount_amount: number;
  net_total: number;
  is_recurring: boolean;
  apply_discount_to_renewal: boolean;
  discount_type: string;
  discount_value: number;
};

export type ComparableOption = {
  mode: "keepit" | "useit";
  total_year_1: number;
  total_recurring: number;
  discount_amount: number;
  lines: ReadonlyArray<Readonly<ComparableOptionLine>>;
};

export type BusinessComparisonPreview = {
  kind: "compare_keepit_useit";
  keepit: ComparableOption;
  useit: ComparableOption;
};

function safeNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("FIN02_NONFINITE_COMPARISON_VALUE");
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function projectOption(option: BusinessOptionTotals, mode: "keepit" | "useit"): ComparableOption {
  if (option.model !== mode) throw new Error("FIN02_WRONG_COMPARISON_OPTION");
  const rows = buildBusinessProposalItemRows(option);
  assertBusinessProposalTotals(rows,option);
  const totals = businessPersistedTotals(rows);
  if (!rows.length || new Set(rows.map(row => row.item_code)).size !== rows.length) {
    throw new Error("FIN02_DUPLICATE_OR_MISSING_PRICE_RULE");
  }
  const lines: ComparableOptionLine[] = rows.map((row,i) => ({
    sort_order: i,
    item_code: row.item_code || "",
    item_name: row.item_name || "",
    category: row.category || "",
    qty: safeNumber(row.qty),
    unit_price: safeNumber(row.unit_price),
    frequency: row.frequency || "one-time",
    gross_total: safeNumber(row.gross_total),
    discount_amount: safeNumber(row.discount_amount),
    net_total: safeNumber(row.net_total),
    is_recurring: Boolean(row.is_recurring),
    apply_discount_to_renewal: Boolean(row.apply_discount_to_renewal),
    discount_type: row.discount_type || "none",
    discount_value: safeNumber(row.discount_value ?? 0),
  }));
  if (lines.some(line => !line.item_code || !line.item_name || line.qty <= 0
    || line.gross_total < 0 || line.net_total < 0 ||
       line.discount_amount < 0 ||
       (line.apply_discount_to_renewal && !line.is_recurring))) {
    throw new Error("FIN02_INVALID_COMPARISON_LINE");
  }
  return Object.freeze({
    mode,
    total_year_1: totals.year1,
    total_recurring: totals.year2Plus,
    discount_amount: totals.discount,
    lines: Object.freeze(lines.map(l=>Object.freeze(l))),
  });
}

/** Compute once for UI. Submission is UNTRUSTED until priced by backend. */
export function prepareBusinessComparisonPreview(
  output: BusinessEngineOutput,
): BusinessComparisonPreview {
  if (!output.keepit || !output.useit) {
    throw new Error("FIN02_COMPARISON_REQUIRES_TWO_COMPLETE_OPTIONS");
  }
  const keepit = projectOption(output.keepit,"keepit");
  const useit = projectOption(output.useit,"useit");
  return Object.freeze({ kind:"compare_keepit_useit" as const, keepit, useit });
}
