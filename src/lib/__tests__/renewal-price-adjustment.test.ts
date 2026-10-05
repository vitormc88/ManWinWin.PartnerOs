import { describe, it, expect } from "vitest";
import { baselinePriceMap, adjustmentRows, applyAdjustment, adjustedPrice, lineKey, unambiguousPaymentTerms } from "@/lib/renewal-price-adjustment";

const SAT = { item_code: "SAT", item_name: "S&AT annual", unit_price: 2192, is_recurring: true };
const WEB = { item_code: "WEB", item_name: "Web annual", unit_price: 4800, is_recurring: true };
const base = baselinePriceMap([SAT, WEB]);

describe("selective renewal price adjustment", () => {
  it("5% on S&AT only: 2192 → 2301.60, Web unchanged", () => {
    const sel = new Set([lineKey(SAT)]);
    const patch = applyAdjustment([SAT, WEB], base, 5, sel);
    expect(patch).toEqual([{ index: 0, unit_price: 2301.6 }]);
    expect(adjustedPrice(2192, 5)).toBe(2301.6);
  });

  it("explicit agreed 2300 is shown as an override of the exact 2301.60; ARR 7100", () => {
    const sel = new Set([lineKey(SAT)]);
    const rows = adjustmentRows([{ ...SAT, unit_price: 2300 }, WEB], base, 5, sel);
    expect(rows[0]).toMatchObject({ baseline: 2192, exact: 2301.6, current: 2300, overridden: true });
    expect(rows[1]).toMatchObject({ baseline: 4800, exact: 4800, current: 4800, overridden: false });
    expect(rows.reduce((s, r) => s + r.current, 0)).toBe(7100);
  });

  it("never compounds: re-applying starts from the baseline", () => {
    const sel = new Set([lineKey(SAT)]);
    const once = { ...SAT, unit_price: applyAdjustment([SAT], base, 5, sel)[0].unit_price };
    const twice = applyAdjustment([once], base, 5, sel)[0].unit_price;
    expect(twice).toBe(2301.6);
  });

  it("ignores one-time and unknown lines", () => {
    const impl = { item_code: "IMP", item_name: "Implementation", unit_price: 900, is_recurring: false };
    expect(applyAdjustment([impl], base, 5, new Set([lineKey(impl)]))).toEqual([]);
  });

  it("reuses payment terms only when unambiguous", () => {
    expect(unambiguousPaymentTerms(["Net 30", " Net 30 ", null])).toBe("Net 30");
    expect(unambiguousPaymentTerms(["Net 30", "Net 60"])).toBeNull();
    expect(unambiguousPaymentTerms([null, ""])).toBeNull();
  });
});
