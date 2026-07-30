import { describe, expect, it } from "vitest";
import {
  annualizeAmount,
  classifyContractLine,
  computeContractFinancials,
  decideFinancialSource,
  groupContractLines,
  isCanonicalLineType,
  normalizeBillingFrequency,
} from "@/lib/contract-lines";

/** Production-shaped Watsons contract lines (legacy `recurring` line_type). */
const watsonsLines = [
  {
    id: "l1",
    line_type: "recurring",
    description: "S&AT",
    amount: 2301.6,
    currency: "EUR",
    billing_frequency: "Annual",
  },
  {
    id: "l2",
    line_type: "recurring",
    description: "SaaS Hosting",
    amount: 1200,
    currency: "EUR",
    billing_frequency: "Annual",
  },
  {
    id: "l3",
    line_type: "recurring",
    description: "ManWinWin Web - 10 accesses",
    amount: 720,
    currency: "EUR",
    billing_frequency: "Annual",
  },
];

describe("Watsons fixture classification", () => {
  it("classifies the three legacy lines as sat / hosting / mww_web", () => {
    const types = watsonsLines.map((l) => classifyContractLine(l).type);
    expect(types).toEqual(["sat", "hosting", "mww_web"]);
  });

  it("flags them as inferred, never as canonical storage", () => {
    const c = classifyContractLine(watsonsLines[0]);
    expect(c.isInferred).toBe(true);
    expect(c.isUnclassified).toBe(false);
    expect(isCanonicalLineType("recurring")).toBe(false);
  });

  it("produces no Other / Needs review bucket", () => {
    const groups = groupContractLines(watsonsLines);
    expect(groups.some((g) => g.isUnclassified)).toBe(false);
    expect(groups.map((g) => g.key)).toEqual(["mww_web", "hosting", "sat"]);
  });

  it("computes recurring ARR and Year 1 of EUR 4,221.60", () => {
    const fin = computeContractFinancials(watsonsLines);
    expect(fin.recurringArr).toBe(4221.6);
    expect(fin.year1Value).toBe(4221.6);
    expect(fin.oneTimeValue).toBe(0);
    expect(fin.currency).toBe("EUR");
    expect(fin.hasReliableLines).toBe(true);
  });
});

describe("legacy and edge-case handling", () => {
  it("keeps an unknown legacy line visible and flagged, out of the totals", () => {
    const fin = computeContractFinancials([
      ...watsonsLines,
      { id: "x", line_type: "recurring", description: "Legacy bundle 2019", amount: 500, currency: "EUR" },
    ]);
    expect(fin.unclassifiedCount).toBe(1);
    expect(fin.unclassifiedTotal).toBe(500);
    expect(fin.recurringArr).toBe(4221.6);

    const groups = groupContractLines([
      { id: "x", line_type: "recurring", description: "Legacy bundle 2019", amount: 500 },
    ]);
    expect(groups[0].isUnclassified).toBe(true);
    expect(groups[0].lines[0].line.description).toBe("Legacy bundle 2019");
    expect(groups[0].subtotal).toBe(500);
  });

  it("never overrides a valid canonical type with description inference", () => {
    const c = classifyContractLine({ line_type: "training", description: "SaaS Hosting workshop" });
    expect(c.type).toBe("training");
    expect(c.isInferred).toBe(false);
  });

  it("normalizes and annualizes billing frequencies", () => {
    expect(normalizeBillingFrequency("Monthly")).toBe("monthly");
    expect(normalizeBillingFrequency("Quarterly")).toBe("quarterly");
    expect(normalizeBillingFrequency("One-time")).toBe("one_time");
    expect(annualizeAmount(100, "monthly")).toBe(1200);
    expect(annualizeAmount(100, "quarterly")).toBe(400);
    expect(annualizeAmount(100, "semiannual")).toBe(200);
    expect(annualizeAmount(100, "annual")).toBe(100);
    expect(annualizeAmount(100, null)).toBe(100);
  });

  it("treats an explicitly one-time recurring-type line as one-time revenue", () => {
    const fin = computeContractFinancials([
      { line_type: "license", description: "Perpetual license", amount: 5000, billing_frequency: "one-time" },
    ]);
    expect(fin.recurringArr).toBe(0);
    expect(fin.oneTimeValue).toBe(5000);
    expect(fin.year1Value).toBe(5000);
  });

  it("applies a discount exactly once and keeps its sign", () => {
    const fin = computeContractFinancials([
      ...watsonsLines,
      { line_type: "discount", description: "Loyalty discount", amount: -221.6, billing_frequency: "Annual" },
    ]);
    expect(fin.discountTotal).toBe(-221.6);
    expect(fin.recurringArr).toBe(4000);
    expect(fin.year1Value).toBe(4000);
  });

  it("counts null amounts as zero and flags them", () => {
    const fin = computeContractFinancials([
      { line_type: "sat", description: "S&AT", amount: null, currency: null },
      ...watsonsLines,
    ]);
    expect(fin.missingAmountCount).toBe(1);
    expect(fin.recurringArr).toBe(4221.6);
  });

  it("detects mixed currencies", () => {
    const fin = computeContractFinancials([
      { line_type: "sat", description: "S&AT", amount: 100, currency: "EUR" },
      { line_type: "hosting", description: "Hosting", amount: 100, currency: "USD" },
    ]);
    expect(fin.mixedCurrency).toBe(true);
  });
});

describe("financial source precedence", () => {
  it("prefers structured lines over legacy header totals", () => {
    const d = decideFinancialSource(watsonsLines, { total_value: 9999, contract_value: 8888 });
    expect(d.source).toBe("contract_lines");
    expect(d.isEstimate).toBe(false);
    expect(d.year1Value).toBe(4221.6);
    expect(d.recurringArr).toBe(4221.6);
  });

  it("falls back to a clearly labelled legacy estimate", () => {
    const d = decideFinancialSource([], { total_value: 5000 });
    expect(d.source).toBe("legacy_header");
    expect(d.isEstimate).toBe(true);
    expect(d.recurringArr).toBeNull();
    expect(d.year1Value).toBe(5000);
  });

  it("reports insufficient detail when nothing reliable exists", () => {
    const d = decideFinancialSource([], {});
    expect(d.source).toBe("insufficient");
    expect(d.year1Value).toBeNull();
  });
});
