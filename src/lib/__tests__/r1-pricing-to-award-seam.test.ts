/**
 * FIN01 -> FIN02 integration seam: the actual proposal persistence projection
 * must satisfy the award-preflight line provenance contract without manual
 * correction of gross/net values or temporary-renewal discount flags.
 *
 * Fictitious Thai Union R1 figures are test vectors, not approved invoices
 * or a replay of historical Won records. No database/network side effects.
 */
import { describe, expect, it } from "vitest";
import type { BusinessLineItem, BusinessOptionTotals } from "../proposal-business-engine";
import {
  assertBusinessProposalTotals,
  buildBusinessProposalItemRows,
  businessPersistedTotals,
} from "../proposal-business-persistence";
import { businessAwardIntegrityBlocker } from "../award-financial-integrity";

const sourceLine = (
  code: string,
  gross: number,
  recurring: boolean,
  discountPct = 0,
  discountRenews = false,
  category: BusinessLineItem["category"] = "module",
): BusinessLineItem => {
  const reduction = Math.round(gross * discountPct) / 100;
  return {
    code, label: code, category, unitPrice: gross, qty: 1,
    amount: gross, discountPct, discountAmount: reduction,
    netAmount: gross - reduction, recurring,
    discountAppliesToRenewal: discountRenews,
    frequency: recurring ? "yearly" : "one-time",
  };
};

const thaiUnion = (webDiscountRenews: boolean, discounted = true): BusinessOptionTotals => {
  const option = {
    model: "keepit" as const,
    software: [
      sourceLine("KEEPIT_SOFTWARE", 251300, false, discounted ? 8 : 0),
      sourceLine("BUS_WEB_MOBILE_USER", 359760, true, discounted ? 3 : 0,
        discounted && webDiscountRenews, "web_user"),
    ],
    api: sourceLine("BUS_API", 600, true, 0, false, "api"),
    hosting: [],
    sat: sourceLine("BUS_KEEPIT_SAT", 43451, true, 0, false, "support"),
    services: [sourceLine("IMPLEMENTATION", 59650, false, 0, false, "service")],
    licenseSubtotal: 251300,
    satBreakdown: {
      satBase: 251300, satPct: 17, satPercentageAmount: 42721,
      baseSatDay: 490, baseDefaultWeb: 240,
    },
    useItDerivation: null,
    totalYear1: discounted ? 683864.20 : 714761,
    totalYear2Plus: discounted && webDiscountRenews ? 393018.20 : 403811,
    totalFiveYears: 0,
    hasDiscounts: discounted,
  };
  return option;
};

function persistThenPlanAward(option: BusinessOptionTotals) {
  // Simulate storage-assigned unique proposal_items IDs; numbers/discount
  // metadata are produced by the actual FIN01 persistence function.
  const items = buildBusinessProposalItemRows(option, "00000000-0000-4000-8000-000000000900")
    .map((row, i) => ({ ...row, id: "saved-item-" + i }));
  assertBusinessProposalTotals(items, option);
  // Build the same contract line source lineage the FIN02 wizard validates;
  // no claim of real RPC execution here (covered by the PostgreSQL Gate3 CI).
  const lines = items.filter(row => Number(row.net_total) > 0).map(row => ({
    source_item_id: row.id, amount: row.net_total,
  }));
  const proposal = {
    product_family: "Business",
    proposal_mode: "keepit_only",
    total_year_1: option.totalYear1,
    total_recurring: option.totalYear2Plus,
  };
  return { items, lines, proposal };
}

describe("R1 FIN01 -> FIN02 pricing-to-award boundary", () => {
  it("takes the saved 8% software / renewing 3% Web discounts to per-line award intact", () => {
    const option = thaiUnion(true);
    const { items, lines, proposal } = persistThenPlanAward(option);
    expect(businessPersistedTotals(items)).toEqual({
      year1: 683864.2, year2Plus: 393018.2, discount: 30896.8,
    });
    expect(items.find(i => i.item_code === "KEEPIT_SOFTWARE")).toMatchObject({
      gross_total: 251300, discount_amount: 20104, net_total: 231196,
    });
    expect(items.find(i => i.item_code === "BUS_WEB_MOBILE_USER")).toMatchObject({
      gross_total: 359760, discount_amount: 10792.8,
      net_total: 348967.2, apply_discount_to_renewal: true,
    });
    // KeepIT S&TA stays on the gross base, NOT reduced by the software discount.
    expect(items.find(i => i.item_code === "BUS_KEEPIT_SAT")?.net_total).toBe(43451);
    expect(businessAwardIntegrityBlocker(proposal, items, lines)).toBeNull();
  });

  it("accepts expiring Year1 Web discount ONLY with gross next-cycle header", () => {
    const { items, lines, proposal } = persistThenPlanAward(thaiUnion(false));
    expect(businessPersistedTotals(items)).toEqual({
      year1: 683864.2, year2Plus: 403811, discount: 30896.8,
    });
    expect(items.find(i => i.item_code === "BUS_WEB_MOBILE_USER")?.apply_discount_to_renewal).toBe(false);
    expect(businessAwardIntegrityBlocker(proposal, items, lines)).toBeNull();
    expect(businessAwardIntegrityBlocker({
      ...proposal, total_recurring: 393018.2,
    }, items, lines)).toBe("FIN02_PROPOSAL_HEADER_LINE_MISMATCH");
  });

  it("supports 0% discounts without carrying stale promotional values into the contract", () => {
    const { items, lines, proposal } = persistThenPlanAward(thaiUnion(false, false));
    expect(businessPersistedTotals(items)).toEqual({
      year1: 714761, year2Plus: 403811, discount: 0,
    });
    expect(items.every(i => Number(i.discount_amount) === 0)).toBe(true);
    expect(businessAwardIntegrityBlocker(proposal, items, lines)).toBeNull();
  });

  it("rejects a forged same-grand-total +100/-100 line substitution", () => {
    const { items, lines, proposal } = persistThenPlanAward(thaiUnion(true));
    const tampered = lines.map(l => ({ ...l }));
    tampered[0].amount = Number(tampered[0].amount) + 100;
    tampered[1].amount = Number(tampered[1].amount) - 100;
    expect(tampered.reduce((sum, l) => sum + Number(l.amount), 0)).toBeCloseTo(optionTotal(items), 2);
    expect(businessAwardIntegrityBlocker(proposal, items, tampered))
      .toBe("FIN02_CONTRACT_LINE_VALUE_MISMATCH");
  });

  it("rejects the original historical gross-only bug, missing source items, and compare mode", () => {
    const { items, lines, proposal } = persistThenPlanAward(thaiUnion(true));
    const grossOnly = items.map(item => ({
      ...item, net_total: item.gross_total, discount_amount: 0,
    }));
    expect(businessAwardIntegrityBlocker(proposal, grossOnly, lines))
      .toBe("FIN02_PROPOSAL_HEADER_LINE_MISMATCH");
    expect(businessAwardIntegrityBlocker(proposal, items, lines.slice(1)))
      .toBe("FIN02_CONTRACT_LINE_COUNT_MISMATCH");
    expect(businessAwardIntegrityBlocker({
      ...proposal, proposal_mode: "compare_keepit_useit",
    }, items, lines)).toMatch(/^FIN02_COMPARE_REQUIRES_AWARDED_OPTION_SNAPSHOT/);
  });
});

function optionTotal(items: ReturnType<typeof buildBusinessProposalItemRows>): number {
  return items.reduce((sum, i) => sum + Number(i.net_total || 0), 0);
}
