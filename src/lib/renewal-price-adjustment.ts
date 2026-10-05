/**
 * Selective renewal price adjustment.
 *
 * A percentage is applied only to the recurring lines the user selects, always
 * from the contract baseline unit price (never from the current edited price),
 * so repeated saves, re-applying or reopening can never compound the increase.
 * Annual amounts use the canonical proposal engine (quantity, frequency and
 * line discounts), exactly like the proposal totals.
 *
 * Lines whose match key (item_code|item_name) occurs more than once in the
 * baseline or in the proposal are ambiguous: they are shown but can never be
 * adjusted, so one tick can never silently change several distinct lines.
 */
import { computeTotals, getItemRenewalValue } from "@/lib/proposal-engine";
import { standardPaymentTerms } from "@/lib/proposal-i18n";
import type { ProposalItem, ProposalLanguage } from "@/types/proposal";

export interface AdjustableLine {
  item_code?: string | null;
  item_name?: string | null;
  unit_price?: number | null;
  is_recurring?: boolean | null;
  qty?: number | null;
  frequency?: string | null;
  category?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  apply_discount_to_renewal?: boolean | null;
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Stable key used to match an edited line back to its contract baseline line. */
export function lineKey(l: AdjustableLine): string {
  return `${(l.item_code || "").trim().toLowerCase()}|${(l.item_name || "").trim().toLowerCase()}`;
}

const asItem = (l: AdjustableLine): ProposalItem =>
  ({
    category: "software",
    ...l,
    qty: l.qty == null ? 1 : Number(l.qty),
    unit_price: Number(l.unit_price) || 0,
    frequency: (l.frequency || "yearly") as ProposalItem["frequency"],
  }) as unknown as ProposalItem;

/** Canonical annual (renewal) value of a recurring line. */
export function annualValue(l: AdjustableLine): number {
  return round2(getItemRenewalValue(asItem(l), 0, 0));
}

function counts(lines: AdjustableLine[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines || []) if (l.is_recurring) m.set(lineKey(l), (m.get(lineKey(l)) || 0) + 1);
  return m;
}

export interface Baseline {
  prices: Map<string, number>;
  /** Keys present more than once in the baseline — never adjustable. */
  ambiguous: Set<string>;
}

/** Baseline unit price per unambiguous line key, from the contract-derived items. */
export function baselinePriceMap(baseline: AdjustableLine[]): Baseline {
  const c = counts(baseline);
  const prices = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const l of baseline || []) {
    if (!l.is_recurring) continue;
    const k = lineKey(l);
    if ((c.get(k) || 0) > 1) ambiguous.add(k);
    else prices.set(k, Number(l.unit_price) || 0);
  }
  return { prices, ambiguous };
}

/** Exact adjusted unit price: baseline × (1 + pct/100), rounded to cents. */
export function adjustedPrice(base: number, pct: number): number {
  return round2((Number(base) || 0) * (1 + (Number(pct) || 0) / 100));
}

export type RowKind = "matched" | "new" | "ambiguous";

export interface AdjustmentRow {
  index: number;
  key: string;
  name: string;
  kind: RowKind;
  adjustable: boolean;
  qty: number;
  baselineUnit: number | null;
  exactUnit: number | null;
  currentUnit: number;
  /** Canonical annual values (qty × frequency − renewal discount). */
  baselineAnnual: number;
  exactAnnual: number;
  currentAnnual: number;
  overridden: boolean;
}

export function adjustmentRows(
  items: AdjustableLine[],
  baseline: Baseline,
  pct: number,
  selected: Set<string>,
): AdjustmentRow[] {
  const itemCounts = counts(items);
  const rows: AdjustmentRow[] = [];
  (items || []).forEach((it, index) => {
    if (!it.is_recurring) return;
    const key = lineKey(it);
    const dup = baseline.ambiguous.has(key) || (itemCounts.get(key) || 0) > 1;
    const matched = !dup && baseline.prices.has(key);
    const kind: RowKind = dup ? "ambiguous" : matched ? "matched" : "new";
    const currentUnit = round2(Number(it.unit_price) || 0);
    const currentAnnual = annualValue(it);
    let baselineUnit: number | null = null;
    let exactUnit: number | null = null;
    let baselineAnnual = 0;
    let exactAnnual = currentAnnual;
    if (matched) {
      baselineUnit = baseline.prices.get(key)!;
      exactUnit = selected.has(key) ? adjustedPrice(baselineUnit, pct) : baselineUnit;
      baselineAnnual = annualValue({ ...it, unit_price: baselineUnit });
      exactAnnual = annualValue({ ...it, unit_price: exactUnit });
    } else if (dup) {
      baselineAnnual = currentAnnual;
    }
    rows.push({
      index,
      key,
      name: it.item_name || it.item_code || "Line",
      kind,
      adjustable: matched,
      qty: it.qty == null ? 1 : Number(it.qty),
      baselineUnit,
      exactUnit,
      currentUnit,
      baselineAnnual,
      exactAnnual,
      currentAnnual,
      overridden: matched && Math.abs(currentUnit - (exactUnit as number)) >= 0.005,
    });
  });
  return rows;
}

/** Recurring annual total via the canonical proposal totals. */
export function recurringTotal(items: AdjustableLine[]): number {
  return round2(computeTotals((items || []).filter((i) => i.is_recurring).map(asItem), 0, 0).totalRecurring);
}

/** New unit prices to set: only unambiguous, selected, matched lines, from baseline. */
export function applyAdjustment<T extends AdjustableLine>(
  items: T[],
  baseline: Baseline,
  pct: number,
  selected: Set<string>,
): Array<{ index: number; unit_price: number }> {
  return adjustmentRows(items, baseline, pct, selected)
    .filter((r) => r.adjustable && selected.has(r.key))
    .map((r) => ({ index: r.index, unit_price: r.exactUnit as number }));
}

/**
 * Previous agreed payment terms, only when unambiguous: exactly one distinct
 * non-empty value across the known sources. Otherwise null → review required.
 */
export function unambiguousPaymentTerms(candidates: Array<string | null | undefined>): string | null {
  const distinct = new Set(candidates.map((c) => (c || "").trim()).filter(Boolean));
  return distinct.size === 1 ? [...distinct][0] : null;
}

/**
 * Payment terms when reopening a saved proposal. A renewal with empty terms
 * stays empty ("Review required"); only non-renewal proposals fall back to the
 * standard implementation terms.
 */
export function hydratedPaymentTerms(saved: string | null | undefined, isRenewal: boolean, language: ProposalLanguage): string {
  if (saved && saved.trim()) return saved;
  return isRenewal ? "" : standardPaymentTerms(language);
}
