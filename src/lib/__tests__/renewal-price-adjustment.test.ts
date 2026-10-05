import { describe, it, expect } from "vitest";
import {
  baselinePriceMap,
  adjustmentRows,
  applyAdjustment,
  adjustedPrice,
  lineKey,
  recurringTotal,
  unambiguousPaymentTerms,
  hydratedPaymentTerms,
} from "@/lib/renewal-price-adjustment";

const SAT = { item_code: "SAT", item_name: "S&AT annual", unit_price: 2192, qty: 1, frequency: "yearly", is_recurring: true };
const WEB = { item_code: "WEB", item_name: "Web annual", unit_price: 4800, qty: 1, frequency: "yearly", is_recurring: true };
const base = baselinePriceMap([SAT, WEB]);

describe("selective renewal price adjustment", () => {
  it("5% on S&AT only: 2192 → 2301.60, Web unchanged", () => {
    const sel = new Set([lineKey(SAT)]);
    expect(applyAdjustment([SAT, WEB], base, 5, sel)).toEqual([{ index: 0, unit_price: 2301.6 }]);
    expect(adjustedPrice(2192, 5)).toBe(2301.6);
  });

  it("agreed 2300 shown as override of exact 2301.60; canonical ARR 7100", () => {
    const sel = new Set([lineKey(SAT)]);
    const items = [{ ...SAT, unit_price: 2300 }, WEB];
    const rows = adjustmentRows(items, base, 5, sel);
    expect(rows[0]).toMatchObject({ baselineUnit: 2192, exactUnit: 2301.6, currentUnit: 2300, overridden: true });
    expect(rows[1]).toMatchObject({ baselineAnnual: 4800, currentAnnual: 4800, overridden: false });
    expect(recurringTotal(items)).toBe(7100);
  });

  it("never compounds: re-applying starts from the baseline", () => {
    const sel = new Set([lineKey(SAT)]);
    const once = { ...SAT, unit_price: applyAdjustment([SAT], base, 5, sel)[0].unit_price };
    expect(applyAdjustment([once], base, 5, sel)[0].unit_price).toBe(2301.6);
  });

  it("quantity > 1, monthly frequency and renewal discount use the canonical annual value", () => {
    const users = { item_code: "WU", item_name: "Web users", unit_price: 10, qty: 3, frequency: "monthly", is_recurring: true,
      discount_type: "percent", discount_value: 10, apply_discount_to_renewal: true };
    const b = baselinePriceMap([users]);
    const sel = new Set([lineKey(users)]);
    const [row] = adjustmentRows([users], b, 5, sel);
    expect(row.baselineAnnual).toBe(324); // 10 × 3 × 12 − 10%
    expect(row.exactUnit).toBe(10.5);
    expect(row.exactAnnual).toBe(340.2);
    expect(recurringTotal([users])).toBe(324);
    expect(applyAdjustment([users], b, 5, sel)).toEqual([{ index: 0, unit_price: 10.5 }]);
  });

  it("a new recurring line is included in the total but is never adjusted", () => {
    const extra = { item_code: "HOST", item_name: "Hosting", unit_price: 600, qty: 2, frequency: "yearly", is_recurring: true };
    const items = [SAT, WEB, extra];
    const sel = new Set([lineKey(extra), lineKey(SAT)]);
    const rows = adjustmentRows(items, base, 5, sel);
    expect(rows[2]).toMatchObject({ kind: "new", adjustable: false, currentAnnual: 1200, baselineAnnual: 0 });
    expect(recurringTotal(items)).toBe(8192);
    expect(applyAdjustment(items, base, 5, sel)).toEqual([{ index: 0, unit_price: 2301.6 }]);
  });

  it("duplicate matching keys are ambiguous and never silently adjusted", () => {
    const dupBase = baselinePriceMap([SAT, { ...SAT, unit_price: 1000 }, WEB]);
    const items = [SAT, { ...SAT, unit_price: 1000 }, WEB];
    const sel = new Set([lineKey(SAT), lineKey(WEB)]);
    const rows = adjustmentRows(items, dupBase, 5, sel);
    expect(rows.filter((r) => r.kind === "ambiguous")).toHaveLength(2);
    expect(applyAdjustment(items, dupBase, 5, sel)).toEqual([{ index: 2, unit_price: 5040 }]);
    // Duplicate only in the proposal (baseline unique) is also ambiguous.
    expect(applyAdjustment([SAT, SAT], base, 5, new Set([lineKey(SAT)]))).toEqual([]);
  });

  it("ignores one-time lines", () => {
    const impl = { item_code: "IMP", item_name: "Implementation", unit_price: 900, is_recurring: false };
    expect(applyAdjustment([impl], base, 5, new Set([lineKey(impl)]))).toEqual([]);
  });

  it("reuses payment terms only when unambiguous", () => {
    expect(unambiguousPaymentTerms(["Net 30", " Net 30 ", null])).toBe("Net 30");
    expect(unambiguousPaymentTerms(["Net 30", "Net 60"])).toBeNull();
    expect(unambiguousPaymentTerms([null, ""])).toBeNull();
  });

  it("reopening a renewal Draft with empty terms keeps them empty in any language", () => {
    expect(hydratedPaymentTerms("", true, "EN")).toBe("");
    expect(hydratedPaymentTerms(null, true, "PT")).toBe("");
    expect(hydratedPaymentTerms("Net 30", true, "PT")).toBe("Net 30");
    expect(hydratedPaymentTerms("", false, "EN")).not.toBe("");
  });
});
