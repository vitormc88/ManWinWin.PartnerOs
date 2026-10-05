/**
 * Selective renewal price adjustment.
 *
 * A percentage is applied only to the recurring lines the user selects, always
 * from the contract baseline price (never from the current edited price), so
 * repeated saves, re-applying or reopening can never compound the increase.
 * The exact arithmetic is shown separately from any agreed (rounded) amount
 * the user then types in.
 */

export interface AdjustableLine {
  item_code?: string | null;
  item_name?: string | null;
  unit_price?: number | null;
  is_recurring?: boolean | null;
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Stable key used to match an edited line back to its contract baseline line. */
export function lineKey(l: AdjustableLine): string {
  return `${(l.item_code || "").trim().toLowerCase()}|${(l.item_name || "").trim().toLowerCase()}`;
}

/** Baseline unit price per line key, from the contract-derived items. */
export function baselinePriceMap(baseline: AdjustableLine[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of baseline || []) if (l.is_recurring) m.set(lineKey(l), Number(l.unit_price) || 0);
  return m;
}

/** Exact adjusted price: baseline × (1 + pct/100), rounded to cents. */
export function adjustedPrice(base: number, pct: number): number {
  return round2((Number(base) || 0) * (1 + (Number(pct) || 0) / 100));
}

export interface AdjustmentRow {
  key: string;
  name: string;
  baseline: number;
  exact: number;
  current: number;
  /** The current price deliberately differs from the exact calculation. */
  overridden: boolean;
}

export function adjustmentRows(
  items: AdjustableLine[],
  baseline: Map<string, number>,
  pct: number,
  selected: Set<string>,
): AdjustmentRow[] {
  return (items || [])
    .filter((it) => it.is_recurring && baseline.has(lineKey(it)))
    .map((it) => {
      const key = lineKey(it);
      const base = baseline.get(key) || 0;
      const exact = selected.has(key) ? adjustedPrice(base, pct) : base;
      const current = round2(Number(it.unit_price) || 0);
      return { key, name: it.item_name || it.item_code || "Line", baseline: base, exact, current, overridden: Math.abs(current - exact) >= 0.005 };
    });
}

/** New unit prices to set: selected lines get the exact price, from baseline. */
export function applyAdjustment<T extends AdjustableLine>(
  items: T[],
  baseline: Map<string, number>,
  pct: number,
  selected: Set<string>,
): Array<{ index: number; unit_price: number }> {
  const out: Array<{ index: number; unit_price: number }> = [];
  items.forEach((it, index) => {
    const key = lineKey(it);
    if (it.is_recurring && selected.has(key) && baseline.has(key)) {
      out.push({ index, unit_price: adjustedPrice(baseline.get(key)!, pct) });
    }
  });
  return out;
}

/**
 * Previous agreed payment terms, only when unambiguous: exactly one distinct
 * non-empty value across the known sources. Otherwise null → review required.
 */
export function unambiguousPaymentTerms(candidates: Array<string | null | undefined>): string | null {
  const distinct = new Set(candidates.map((c) => (c || "").trim()).filter(Boolean));
  return distinct.size === 1 ? [...distinct][0] : null;
}
