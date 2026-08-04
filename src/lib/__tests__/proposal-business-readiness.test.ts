import { describe, it, expect } from "vitest";
import {
  BUSINESS_BASE_RULE_CODE,
  BusinessPricingError,
  assertBusinessOptionsComputable,
  checkBusinessPricingReadiness,
  requiredBusinessRuleCodes,
} from "../proposal-business-readiness";
import {
  DEFAULT_BUSINESS_CONFIG,
  computeBusinessOptions,
  type BusinessConfig,
} from "../proposal-business-engine";
import type { PricingRule } from "@/types/proposal";

const rule = (code: string, unit_price = 100, extra: Partial<PricingRule> = {}): PricingRule =>
  ({
    id: code,
    code,
    label: code,
    category: "business",
    unit_price,
    unit_type: "one-time",
    currency: "EUR",
    active: true,
    notes: null,
    ...extra,
  }) as PricingRule;

/** Minimal complete rule set for the default config (SaaS + RCI Business). */
const minimalRules = (): PricingRule[] => [
  rule(BUSINESS_BASE_RULE_CODE, 5000),
  rule("BUS_SAAS_HOSTING_BASE", 1200, { unit_type: "yearly" }),
  rule("BUS_KEEPIT_SAT", 0, { support_percentage: 17, unit_type: "yearly" }),
  rule("BUS_USEIT_SAT", 0, { unit_type: "yearly" }),
  rule("BUS_RCI_BASE", 2500),
];

const cfg: BusinessConfig = { ...DEFAULT_BUSINESS_CONFIG };

describe("business pricing readiness", () => {
  it("always requires the base maintenance module", () => {
    expect(requiredBusinessRuleCodes(cfg)).toContain(BUSINESS_BASE_RULE_CODE);
  });

  it("reports missing base and blocks generation for an empty rule set", () => {
    const res = checkBusinessPricingReadiness({ rules: [], cfg });
    expect(res.ok).toBe(false);
    expect(res.queryFailed).toBe(false);
    expect(res.missing).toContain(BUSINESS_BASE_RULE_CODE);
    expect(res.message).toContain(BUSINESS_BASE_RULE_CODE);
  });

  it("reports missing codes for an incomplete rule set", () => {
    const rules = minimalRules().filter((r) => r.code !== "BUS_RCI_BASE");
    const res = checkBusinessPricingReadiness({ rules, cfg });
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["BUS_RCI_BASE"]);
  });

  it("requires KeepIT module codes even for a UseIT-only proposal", () => {
    const selective: BusinessConfig = { ...cfg, includeStock: true };
    const codes = requiredBusinessRuleCodes(selective, ["useit"]);
    expect(codes).toContain("BUS_KEEPIT_STOCK_MODULE");
    expect(codes).toContain("BUS_USEIT_SAT");
    expect(codes).not.toContain("BUS_KEEPIT_SAT");
  });

  it("accepts a complete minimal rule set and computes KeepIT + derived UseIT", () => {
    const rules = minimalRules();
    const res = checkBusinessPricingReadiness({ rules, cfg });
    expect(res.ok).toBe(true);
    expect(res.missing).toEqual([]);

    const out = computeBusinessOptions(rules, cfg, ["keepit", "useit"]);
    expect(out.keepit).not.toBeNull();
    expect(out.useit).not.toBeNull();
    expect(out.useit!.useItDerivation!.keepitLicenseBase).toBe(5000);
    expect(out.keepit!.totalYear1).toBeGreaterThan(0);
    expect(out.useit!.totalYear1).toBeGreaterThan(0);
  });

  it("distinguishes a pricing query error from missing data", () => {
    const res = checkBusinessPricingReadiness({
      rules: [],
      cfg,
      error: new Error("network down"),
    });
    expect(res.ok).toBe(false);
    expect(res.queryFailed).toBe(true);
    expect(res.missing).toEqual([]);
    expect(res.message).toMatch(/could not be loaded/i);
  });

  it("reports a loading state distinct from both", () => {
    const res = checkBusinessPricingReadiness({ rules: [], cfg, isLoading: true });
    expect(res.loading).toBe(true);
    expect(res.queryFailed).toBe(false);
    expect(res.missing).toEqual([]);
  });
});

describe("assertBusinessOptionsComputable", () => {
  it("throws a controlled descriptive error when no option can be computed", () => {
    const out = computeBusinessOptions([], cfg, ["keepit", "useit"]);
    expect(out.keepit).toBeNull();
    expect(out.useit).toBeNull();

    let caught: unknown;
    try {
      assertBusinessOptionsComputable(out, { cfg, rules: [], models: ["keepit", "useit"] });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BusinessPricingError);
    expect(caught).not.toBeInstanceOf(TypeError);
    expect((caught as BusinessPricingError).message).toContain(BUSINESS_BASE_RULE_CODE);
    expect((caught as BusinessPricingError).missing).toContain(BUSINESS_BASE_RULE_CODE);
  });

  it("passes through when at least one option is computable", () => {
    const rules = minimalRules();
    const out = computeBusinessOptions(rules, cfg, ["keepit"]);
    expect(() =>
      assertBusinessOptionsComputable(out, { cfg, rules, models: ["keepit"] }),
    ).not.toThrow();
  });
});
