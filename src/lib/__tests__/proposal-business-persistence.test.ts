import { describe, expect, it } from "vitest";
import {
  assertBusinessProposalTotals,
  buildBusinessProposalItemRows,
  businessPersistedTotals,
} from "../proposal-business-persistence";
import {
  computeBusinessOption,
  DEFAULT_BUSINESS_CONFIG,
  DEFAULT_BUSINESS_DISCOUNTS,
  type BusinessLineItem,
  type BusinessOptionTotals,
} from "../proposal-business-engine";
import type { PricingRule } from "@/types/proposal";

function line(p: Partial<BusinessLineItem> & Pick<BusinessLineItem, "code" | "category" | "amount">): BusinessLineItem {
  const gross = p.amount;
  const discount = p.discountAmount ?? 0;
  return {
    code: p.code,
    label: p.label ?? p.code,
    category: p.category,
    qty: p.qty ?? 1,
    unitPrice: p.unitPrice ?? gross,
    amount: gross,
    discountPct: p.discountPct ?? 0,
    discountAmount: discount,
    netAmount: p.netAmount ?? +(gross - discount).toFixed(2),
    recurring: p.recurring ?? false,
    discountAppliesToRenewal: p.discountAppliesToRenewal ?? false,
    frequency: p.frequency ?? "one-time",
  };
}

/** Values from the fictitious Thai Union R1 commercial scenario, not approved pricing. */
function thaiUnionOption(webDiscountRenews = true): BusinessOptionTotals {
  return {
    model: "keepit",
    software: [
      line({ code: "KEEPIT_SOFTWARE", category: "module", amount: 251300,
        discountPct: 8, discountAmount: 20104 }),
      line({ code: "BUS_WEB_MOBILE_USER", category: "web_user", amount: 359760,
        qty: 1499, unitPrice: 20, frequency: "per-user-month", recurring: true,
        discountPct: 3, discountAmount: 10792.8, discountAppliesToRenewal: webDiscountRenews }),
    ],
    api: line({ code: "BUS_API", category: "api", amount: 600, recurring: true, frequency: "yearly" }),
    hosting: [],
    sat: line({ code: "BUS_KEEPIT_SAT", category: "support", amount: 43451, recurring: true, frequency: "yearly" }),
    services: [line({ code: "IMPLEMENTATION", category: "service", amount: 59650 })],
    licenseSubtotal: 251300,
    satBreakdown: { satBase: 251300, satPct: 17, satPercentageAmount: 42721,
      baseSatDay: 490, baseDefaultWeb: 240 },
    useItDerivation: null,
    totalYear1: 683864.2,
    totalYear2Plus: webDiscountRenews ? 393018.2 : 403811,
    totalFiveYears: 0,
    hasDiscounts: true,
  };
}

describe("Business proposal financial persistence — R1 regression", () => {
  it("persists negotiated net lines and reconciles €683,864.20 / €393,018.20", () => {
    const option = thaiUnionOption();
    const rows = buildBusinessProposalItemRows(option);
    expect(rows).toHaveLength(5);
    expect(businessPersistedTotals(rows)).toEqual({
      year1: 683864.2, year2Plus: 393018.2, discount: 30896.8,
    });
    expect(rows.find(row => row.item_code === "BUS_WEB_MOBILE_USER")).toMatchObject({
      discount_type: "percent", discount_value: 3, discount_amount: 10792.8,
      gross_total: 359760, net_total: 348967.2, apply_discount_to_renewal: true,
    });
    expect(rows.find(row => row.item_code === "BUS_KEEPIT_SAT")).toMatchObject({
      gross_total: 43451, net_total: 43451, discount_type: "none", discount_value: 0,
    });
    expect(() => assertBusinessProposalTotals(rows, option)).not.toThrow();
  });

  it("does not renew a Web/App discount when the option explicitly says no", () => {
    const option = thaiUnionOption(false);
    const rows = buildBusinessProposalItemRows(option);
    expect(businessPersistedTotals(rows).year2Plus).toBe(403811);
    expect(rows.find(row => row.item_code === "BUS_WEB_MOBILE_USER")?.apply_discount_to_renewal).toBe(false);
    expect(() => assertBusinessProposalTotals(rows, option)).not.toThrow();
  });

  it("passes a fully gross 0% discount scenario without accidentally inventing a reduction", () => {
    const option = thaiUnionOption();
    const noDiscount = { ...option,
      software: option.software.map(row => ({ ...row, discountPct: 0, discountAmount: 0,
        netAmount: row.amount, discountAppliesToRenewal: false })),
      totalYear1: 714761,
      totalYear2Plus: 403811,
    };
    const rows = buildBusinessProposalItemRows(noDiscount);
    expect(businessPersistedTotals(rows)).toEqual({
      year1: 714761, year2Plus: 403811, discount: 0,
    });
    expect(() => assertBusinessProposalTotals(rows, noDiscount)).not.toThrow();
  });

  it("fails closed if the persisted financial lines diverge from the priced header", () => {
    const option = thaiUnionOption();
    const brokenRows = buildBusinessProposalItemRows(option).map(row => ({
      ...row, net_total: row.gross_total, discount_amount: 0,
    }));
    expect(() => assertBusinessProposalTotals(brokenRows, option)).toThrow("BUSINESS_TOTAL_MISMATCH");
  });

  it("preserves the S&TA gross license base when software discount changes", () => {
    const makeRule = (code: string, unit_price: number, extra: Partial<PricingRule> = {}): PricingRule => ({
      id: code, code, label: code, category: "software", unit_price,
      unit_type: "one-time", currency: "EUR", active: true, notes: null, ...extra,
    });
    const rules: PricingRule[] = [
      makeRule("BUS_KEEPIT_MAINTENANCE_MODULE", 6800),
      makeRule("BUS_KEEPIT_ADDITIONAL_BACKOFFICE", 950),
      makeRule("BUS_KEEPIT_SAT", 0, { support_percentage: 17 }),
      makeRule("BUS_BASE_SAT_DAY", 490),
      makeRule("BUS_BASE_DEFAULT_WEB", 240),
    ];
    const cfg = { ...DEFAULT_BUSINESS_CONFIG, additionalBackoffice: 247,
      discounts: { ...DEFAULT_BUSINESS_DISCOUNTS, softwarePct: 8 } };
    const discounted = computeBusinessOption(rules, cfg, "keepit");
    const gross = computeBusinessOption(rules, { ...cfg,
      discounts: { ...cfg.discounts, softwarePct: 0 } }, "keepit");
    expect(discounted?.satBreakdown.satBase).toBe(241450);
    expect(discounted?.sat?.netAmount).toBe(41776.5);
    expect(discounted?.sat?.netAmount).toBe(gross?.sat?.netAmount);
    expect(discounted?.software[0].netAmount).toBeLessThan(gross!.software[0].netAmount);
  });
});
