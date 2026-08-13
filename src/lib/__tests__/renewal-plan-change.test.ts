import { describe, it, expect } from "vitest";
import {
  computePlanChange,
  implementationRule,
  planLicenseRule,
  validatePlanChangeDiscounts,
  implementationDiscountAmount,
} from "@/lib/renewal-plan-change";
import type { RenewalBaseline } from "@/lib/renewal-baseline";
import type { PricingRule } from "@/types/proposal";

/** Active catalogue subset (mirrors the real pricing_rules rows). */
const rules: PricingRule[] = [
  r("plan_1_annual", "ManWinWin Professional - Plan 1 (annual license)", "software", 936),
  r("plan_2_annual", "ManWinWin Professional - Plan 2 (annual license)", "software", 1296),
  r("plan_3_annual", "ManWinWin Professional - Plan 3 (annual license)", "software", 1800),
  r("impl_online_p1", "Online Implementation - Plan 1", "service", 1890),
  r("impl_online_p2", "Online Implementation - Plan 2", "service", 2700),
  r("impl_online_p3", "Online Implementation - Plan 3", "service", 3590),
  r("impl_light_p1", "Online Light Implementation - Plan 1", "service", 990),
  r("impl_light_p3", "Online Light Implementation - Plan 3", "service", 1650),
];

function r(code: string, label: string, category: string, unit_price: number): PricingRule {
  return {
    id: `id-${code}`,
    code,
    label,
    category,
    unit_price,
    unit_type: category === "service" ? "one-time" : "yearly",
    currency: "EUR",
    active: true,
    notes: null,
    product_family: "Professional",
  } as PricingRule;
}

/**
 * APS-equivalent acceptance fixture (isolated, never real data):
 * Professional 1, SaaS, 1 BackOffice, 4 Web, actual recurring €1,656
 * (license €696 + 4 web accesses €960).
 */
const apsBaseline: RenewalBaseline = {
  hasRealData: true,
  renewalId: "ren-aps",
  clientId: "cli-aps",
  contractId: "con-aps",
  licenseId: "lic-aps",
  productFamily: "Professional",
  product: "Professional 1",
  variantLabel: "Professional 1",
  variantNeedsReview: false,
  plan: 1,
  hosting: "SaaS",
  version: "7.5",
  backofficeUsers: 1,
  webUsers: 4,
  mobileUsers: 0,
  modules: [],
  plugins: [],
  currency: "EUR",
  currentRecurring: 1656,
  recurringLines: [
    { key: "l1", label: "ManWinWin Professional 1 — annual license", lineType: "license", amount: 696, needsReview: false },
    { key: "l2", label: "ManWinWin WEB — 4 accesses", lineType: "mww_web", amount: 960, needsReview: false },
  ],
  historicalOneTime: 0,
  contractStartDate: "2025-01-01",
  contractEndDate: "2025-12-31",
  renewalDate: "2026-01-01",
  billingFrequency: "Annual",
  unmappedFields: [],
};

describe("APS-equivalent upgrade acceptance fixture", () => {
  const out = computePlanChange({
    baseline: apsBaseline,
    rules,
    mode: "upgrade",
    targetPlan: 3,
    implementationKind: "standard",
    implementationDiscount: { type: "percent", value: 50 },
  });

  it("has no blockers", () => {
    expect(out.blockers).toEqual([]);
    expect(out.applicable).toBe(true);
  });

  it("prices the target plan and keeps the unchanged configuration", () => {
    expect(out.targetPlanPrice).toBe(1800);
    expect(out.unchangedRecurringTotal).toBe(960);
    expect(out.replacedLicenseLines).toHaveLength(1);
  });

  it("produces the exact expected commercial result", () => {
    expect(out.proposedRecurring).toBe(2760);
    expect(out.recurringDelta).toBe(1104);
    expect(out.targetImplementation).toBe(3590);
    expect(out.currentImplementationCredit).toBe(1890);
    expect(out.implementationGrossDelta).toBe(1700);
    expect(out.implementationDiscountAmount).toBe(850);
    expect(out.implementationNet).toBe(850);
    expect(out.year1).toBe(3610);
    expect(out.year2Plus).toBe(2760);
  });

  it("never charges the full target implementation", () => {
    expect(out.implementationGrossDelta).not.toBe(3590);
  });

  it("persists structured provenance on every line", () => {
    const plan = out.items.find((i) => i.change_kind === "plan_change")!;
    expect(plan.pricing_rule_code).toBe("plan_3_annual");
    expect(plan.source_plan).toBe(1);
    expect(plan.target_plan).toBe(3);
    expect(plan.line_type).toBe("license");
    expect(plan.is_recurring).toBe(true);

    const kept = out.items.find((i) => i.change_kind === "unchanged")!;
    expect(kept.line_type).toBe("mww_web");
    expect(kept.net_total).toBe(960);

    const impl = out.items.find((i) => i.change_kind === "implementation_delta")!;
    expect(impl.pricing_rule_code).toBe("impl_online_p3");
    expect(impl.gross_delta).toBe(1700);
    expect(impl.discount_amount).toBe(850);
    expect(impl.net_total).toBe(850);
    expect(impl.is_recurring).toBe(false);
  });

  it("keeps the full proposed recurring value in the lines, not only the delta", () => {
    const recurring = out.items.filter((i) => i.is_recurring).reduce((s, i) => s + Number(i.net_total || 0), 0);
    expect(recurring).toBe(2760);
  });
});

describe("straight renewal is untouched", () => {
  it("returns a non-applicable computation with no items", () => {
    const out = computePlanChange({
      baseline: apsBaseline,
      rules,
      mode: "straight",
      targetPlan: null,
      implementationKind: "standard",
    });
    expect(out.applicable).toBe(false);
    expect(out.items).toEqual([]);
    expect(out.blockers).toEqual([]);
  });
});

describe("downgrade", () => {
  const out = computePlanChange({
    baseline: { ...apsBaseline, plan: 3, currentRecurring: 2760, recurringLines: [
      { key: "l1", label: "Professional 3 — annual license", lineType: "license", amount: 1800, needsReview: false },
      { key: "l2", label: "ManWinWin WEB — 4 accesses", lineType: "mww_web", amount: 960, needsReview: false },
    ] },
    rules,
    mode: "downgrade",
    targetPlan: 1,
    implementationKind: "standard",
    implementationDiscount: { type: "percent", value: 50 },
  });

  it("has zero implementation delta", () => {
    expect(out.implementationGrossDelta).toBe(0);
    expect(out.implementationNet).toBe(0);
    expect(out.items.some((i) => i.change_kind === "implementation_delta")).toBe(false);
  });

  it("reduces the recurring value to plan + unchanged configuration", () => {
    expect(out.proposedRecurring).toBe(1896);
    expect(out.recurringDelta).toBe(-864);
    expect(out.year1).toBe(1896);
  });
});

describe("implementation matching", () => {
  it("matches light to light and never mixes flavours", () => {
    const out = computePlanChange({
      baseline: apsBaseline,
      rules,
      mode: "upgrade",
      targetPlan: 3,
      implementationKind: "light",
    });
    expect(out.targetImplementation).toBe(1650);
    expect(out.currentImplementationCredit).toBe(990);
    expect(out.implementationGrossDelta).toBe(660);
  });

  it("resolves rules by exact catalogue code", () => {
    expect(planLicenseRule(rules, 2)?.code).toBe("plan_2_annual");
    expect(implementationRule(rules, 2, "standard")?.code).toBe("impl_online_p2");
    expect(implementationRule(rules, 2, "light")).toBeNull();
  });

  it("blocks when the matching implementation price is missing", () => {
    const out = computePlanChange({
      baseline: apsBaseline,
      rules,
      mode: "upgrade",
      targetPlan: 2,
      implementationKind: "light",
    });
    expect(out.blockers.join(" ")).toContain("light implementation price for Professional 2");
    expect(out.items).toEqual([]);
  });
});

describe("guards", () => {
  it("never infers the current plan", () => {
    const out = computePlanChange({
      baseline: { ...apsBaseline, plan: null },
      rules,
      mode: "upgrade",
      targetPlan: 3,
      implementationKind: "standard",
    });
    expect(out.blockers[0]).toContain("current Professional plan is not recorded");
    expect(out.items).toEqual([]);
  });

  it("requires a target plan", () => {
    const out = computePlanChange({
      baseline: apsBaseline,
      rules,
      mode: "upgrade",
      targetPlan: null,
      implementationKind: "standard",
    });
    expect(out.blockers.join(" ")).toContain("Select the target Professional plan");
  });

  it("rejects an upgrade to a lower plan", () => {
    const out = computePlanChange({
      baseline: apsBaseline,
      rules,
      mode: "upgrade",
      targetPlan: 1,
      implementationKind: "standard",
    });
    expect(out.blockers.join(" ")).toContain("same as the current plan");
  });

  it("blocks when no core license line exists in the contract", () => {
    const out = computePlanChange({
      baseline: { ...apsBaseline, recurringLines: [apsBaseline.recurringLines[1]] },
      rules,
      mode: "upgrade",
      targetPlan: 3,
      implementationKind: "standard",
    });
    expect(out.blockers.join(" ")).toContain("No core license line");
  });

  it("allows a discount only on the incremental implementation line", () => {
    const out = computePlanChange({
      baseline: apsBaseline,
      rules,
      mode: "upgrade",
      targetPlan: 3,
      implementationKind: "standard",
      implementationDiscount: { type: "percent", value: 50 },
    });
    expect(validatePlanChangeDiscounts(out.items).ok).toBe(true);

    const tampered = out.items.map((i) =>
      i.change_kind === "plan_change" ? { ...i, discount_type: "percent" as const, discount_value: 10 } : i,
    );
    const res = validatePlanChangeDiscounts(tampered);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("never recurring software");
  });

  it("caps a fixed discount at the incremental gross", () => {
    expect(implementationDiscountAmount(1700, { type: "fixed", value: 5000 })).toBe(1700);
    expect(implementationDiscountAmount(1700, { type: "fixed", value: 200 })).toBe(200);
    expect(implementationDiscountAmount(0, { type: "percent", value: 50 })).toBe(0);
  });
});
