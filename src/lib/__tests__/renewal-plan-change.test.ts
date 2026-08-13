import { describe, it, expect } from "vitest";
import {
  computePlanChange,
  planLicenseRule,
  validatePlanChangeDiscounts,
  implementationDiscountAmount,
} from "@/lib/renewal-plan-change";
import {
  INCREMENTAL_IMPLEMENTATION_BLOCKER,
  findTransitionRule,
  resolveIncrementalImplementation,
  type PlanTransitionRule,
} from "@/lib/renewal-implementation";
import {
  computeEntitlements,
  entitlementLabel,
  includedAccesses,
} from "@/lib/renewal-entitlements";
import type { RenewalBaseline } from "@/lib/renewal-baseline";
import type { PricingRule } from "@/types/proposal";

/** Active catalogue subset (mirrors the real pricing_rules rows). */
const rules: PricingRule[] = [
  r("plan_1_annual", "ManWinWin Professional - Plan 1 (annual license)", "software", 936, "yearly", "Professional"),
  r("plan_2_annual", "ManWinWin Professional - Plan 2 (annual license)", "software", 1296, "yearly", "Professional"),
  r("plan_3_annual", "ManWinWin Professional - Plan 3 (annual license)", "software", 1800, "yearly", "Professional"),
  r("web_user", "ManWinWin WEB / Mobility additional access", "addon", 20, "per-user-month", "Professional"),
  r("BUS_WEB_MOBILE_USER", "ManWinWin Web / Smart Tag / App user", "web_user", 20, "per-user-month", "Business"),
  r("BUS_USEIT_ADDITIONAL_BACKOFFICE", "Additional simultaneous BackOffice access", "backoffice_user", 352, "yearly", "Business"),
];

function r(
  code: string,
  label: string,
  category: string,
  unit_price: number,
  unit_type: string,
  product_family: string,
): PricingRule {
  return {
    id: `id-${code}`,
    code,
    label,
    category,
    unit_price,
    unit_type,
    currency: "EUR",
    active: true,
    notes: null,
    product_family,
  } as PricingRule;
}

/** Configured plan-transition rule (precedence 1) — the real incremental effort. */
const transitionRules: PlanTransitionRule[] = [
  {
    id: "tr-p1-p3",
    code: "TR_P1_P3_STD",
    label: "Professional 1 → 3 incremental implementation",
    source_family: "Professional",
    target_family: "Professional",
    source_plan: 1,
    target_plan: 3,
    implementation_kind: "standard",
    pricing_mode: "fixed",
    incremental_gross: 1650,
    active: true,
  },
  {
    id: "tr-p1-p2-hours",
    code: "TR_P1_P2_HOURS",
    label: "Professional 1 → 2 incremental implementation",
    source_family: "Professional",
    target_family: "Professional",
    source_plan: 1,
    target_plan: 2,
    implementation_kind: "standard",
    pricing_mode: "hours_rate",
    hours: 10,
    hourly_rate: 95,
    active: true,
  },
];

/**
 * APS-equivalent acceptance fixture (isolated, never real data):
 * Professional 1, SaaS, total 1 BackOffice + 4 Web, S&AT included.
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

const upgrade = (over: Record<string, any> = {}) =>
  computePlanChange({
    baseline: apsBaseline,
    rules,
    mode: "upgrade",
    targetPlan: 3,
    implementationKind: "standard",
    transitionRules,
    implementationDiscount: { type: "percent", value: 50 },
    ...over,
  });

/* ------------------------------------------------------------------ */
/* A — entitlements                                                    */
/* ------------------------------------------------------------------ */

describe("entitlement rule (licensed capacity vs billable quantity)", () => {
  it("uses the central product defaults", () => {
    expect(includedAccesses("Professional", "backoffice")).toBe(1);
    expect(includedAccesses("Professional", "web")).toBe(1);
    expect(includedAccesses("Business", "backoffice")).toBe(3);
    expect(includedAccesses("Business", "web")).toBe(1);
  });

  it("Professional 1 BO / 4 Web → 0 BO additional, 3 Web additional", () => {
    const e = computeEntitlements({ family: "Professional", backofficeTotal: 1, webTotal: 4 });
    expect(e.backoffice.billable).toBe(0);
    expect(e.web.billable).toBe(3);
    expect(e.web.total).toBe(4);
    expect(e.web.included).toBe(1);
  });

  it("Business 5 BO / 4 Web → 2 BO additional, 3 Web additional", () => {
    const e = computeEntitlements({ family: "Business", backofficeTotal: 5, webTotal: 4 });
    expect(e.backoffice.billable).toBe(2);
    expect(e.web.billable).toBe(3);
  });

  it("Business 3 BO / 1 Web → zero additions", () => {
    const e = computeEntitlements({ family: "Business", backofficeTotal: 3, webTotal: 1 });
    expect(e.backoffice.billable).toBe(0);
    expect(e.web.billable).toBe(0);
    expect(e.billableAnnualTotal).toBe(0);
  });

  it("flags a below-minimum configuration instead of crediting", () => {
    const e = computeEntitlements({ family: "Business", backofficeTotal: 1, webTotal: 1 });
    expect(e.backoffice.billable).toBe(0);
    expect(e.backoffice.inconsistent).toBe(true);
    expect(e.inconsistencies).toHaveLength(1);
  });

  it("annualizes monthly access prices and renders the display label", () => {
    const e = computeEntitlements({
      family: "Professional",
      backofficeTotal: 1,
      webTotal: 4,
      pricing: { web: { unitPrice: 20, billingFrequency: "monthly", ruleCode: "web_user" } },
    });
    expect(e.web.annualUnitPrice).toBe(240);
    expect(e.web.annualAmount).toBe(720);
    expect(entitlementLabel(e.web)).toBe("Web accesses: 4 total · 1 included · 3 additional billable");
  });
});

/* ------------------------------------------------------------------ */
/* F — exact APS acceptance                                            */
/* ------------------------------------------------------------------ */

describe("APS-equivalent upgrade acceptance fixture (real PO)", () => {
  const out = upgrade();

  it("has no blockers", () => {
    expect(out.blockers).toEqual([]);
    expect(out.applicable).toBe(true);
  });

  it("preserves total licensed capacity and recalculates included/billable", () => {
    expect(out.proposedEntitlements.web.total).toBe(4);
    expect(out.proposedEntitlements.web.included).toBe(1);
    expect(out.proposedEntitlements.web.billable).toBe(3);
    expect(out.proposedEntitlements.backoffice.total).toBe(1);
    expect(out.proposedEntitlements.backoffice.billable).toBe(0);
    // Capacity is identical before and after the change.
    expect(out.currentEntitlements.web.total).toBe(out.proposedEntitlements.web.total);
  });

  it("produces the exact expected commercial result", () => {
    expect(out.targetPlanPrice).toBe(1800);
    expect(out.billableAccessTotal).toBe(720);
    expect(out.proposedRecurring).toBe(2520);
    expect(out.year2Plus).toBe(2520);
    expect(out.implementationGross).toBe(1650);
    expect(out.implementationDiscountAmount).toBe(825);
    expect(out.implementationNet).toBe(825);
    expect(out.year1).toBe(3345);
  });

  it("rejects the previous wrong expectations", () => {
    expect(out.proposedRecurring).not.toBe(2760);
    expect(out.implementationGross).not.toBe(1700);
    expect(out.year1).not.toBe(3610);
  });

  it("never charges included quantities and never double-bills accesses", () => {
    const access = out.items.find((i) => i.change_kind === "access_addition")!;
    expect(access.qty).toBe(3);
    expect(access.unit_price).toBe(240);
    expect(access.net_total).toBe(720);
    expect(access.total_licensed_qty).toBe(4);
    expect(access.included_qty).toBe(1);
    expect(access.billable_qty).toBe(3);
    // The old contract web line is replaced, not kept alongside the additions.
    expect(out.items.filter((i) => i.line_type === "mww_web")).toHaveLength(1);
  });

  it("keeps the full proposed recurring value in the lines, not only the delta", () => {
    const recurring = out.items.filter((i) => i.is_recurring).reduce((s, i) => s + Number(i.net_total || 0), 0);
    expect(recurring).toBe(2520);
  });

  it("persists structured provenance on every line", () => {
    const plan = out.items.find((i) => i.change_kind === "plan_change")!;
    expect(plan.pricing_rule_code).toBe("plan_3_annual");
    expect(plan.source_plan).toBe(1);
    expect(plan.target_plan).toBe(3);
    expect(plan.included_qty).toBe(1);

    const impl = out.items.find((i) => i.change_kind === "implementation_delta")!;
    expect(impl.implementation_source).toBe("transition_rule");
    expect(impl.transition_rule_code).toBe("TR_P1_P3_STD");
    expect(impl.gross_total).toBe(1650);
    expect(impl.discount_amount).toBe(825);
    expect(impl.net_total).toBe(825);
    expect(impl.is_recurring).toBe(false);
  });

  it("keeps implementation out of the recurring value (never ARR)", () => {
    expect(out.year2Plus).toBe(out.proposedRecurring);
    expect(out.year1! - out.year2Plus!).toBe(825);
  });

  it("exposes an entitlement snapshot for persistence", () => {
    expect((out.entitlementSnapshot as any).web).toMatchObject({ total: 4, included: 1, billable: 3 });
  });
});

/* ------------------------------------------------------------------ */
/* C — incremental implementation precedence                           */
/* ------------------------------------------------------------------ */

describe("incremental implementation", () => {
  it("uses hours × rate from a configured rule", () => {
    const out = computePlanChange({
      baseline: apsBaseline,
      rules,
      mode: "upgrade",
      targetPlan: 2,
      implementationKind: "standard",
      transitionRules,
    });
    expect(out.implementation.source).toBe("transition_rule");
    expect(out.implementation.hours).toBe(10);
    expect(out.implementation.hourlyRate).toBe(95);
    expect(out.implementationGross).toBe(950);
  });

  it("accepts an HQ-authorized manual amount with justification", () => {
    const out = upgrade({
      transitionRules: [],
      manualImplementation: {
        gross: 1650,
        justification: "Stock + Purchase Orders configuration and data migration",
        authorized: true,
        confirmedBy: "hq-user",
        confirmedAt: "2026-08-13T12:00:00Z",
      },
    });
    expect(out.implementation.source).toBe("manual_hq");
    expect(out.implementationNet).toBe(825);
    expect(out.year1).toBe(3345);
    const impl = out.items.find((i) => i.change_kind === "implementation_delta")!;
    expect(impl.justification).toContain("Stock");
  });

  it("blocks a manual amount without justification or HQ authorization", () => {
    const noJust = upgrade({
      transitionRules: [],
      manualImplementation: { gross: 1650, justification: "", authorized: true },
    });
    expect(noJust.blockers.join(" ")).toContain("justification is mandatory");

    const notHq = upgrade({
      transitionRules: [],
      manualImplementation: { gross: 1650, justification: "why", authorized: false },
    });
    expect(notHq.blockers.join(" ")).toContain("only HQ can authorize");
  });

  it("blocks generation when nothing proves the incremental effort", () => {
    const out = upgrade({ transitionRules: [], manualImplementation: null });
    expect(out.blockers.join(" ")).toContain(INCREMENTAL_IMPLEMENTATION_BLOCKER);
    expect(out.items).toEqual([]);
  });

  it("never falls back to the full target implementation package", () => {
    const out = upgrade({ transitionRules: [] });
    expect(out.implementationGross).toBe(0);
    expect(out.blockers.length).toBeGreaterThan(0);
  });

  it("never mixes standard and light flavours", () => {
    const out = upgrade({ implementationKind: "light" });
    expect(out.blockers.join(" ")).toContain(INCREMENTAL_IMPLEMENTATION_BLOCKER);
    expect(findTransitionRule(transitionRules, {
      sourceFamily: "Professional",
      targetFamily: "Professional",
      sourcePlan: 1,
      targetPlan: 3,
      implementationKind: "light",
    })).toBeNull();
  });

  it("charges nothing for a downgrade", () => {
    const res = resolveIncrementalImplementation({
      required: false,
      context: {
        sourceFamily: "Professional",
        targetFamily: "Professional",
        sourcePlan: 3,
        targetPlan: 1,
        implementationKind: "standard",
      },
      transitionRules,
    });
    expect(res.gross).toBe(0);
    expect(res.blockers).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* B / G — change modes and regression coverage                        */
/* ------------------------------------------------------------------ */

describe("straight renewal", () => {
  const out = computePlanChange({
    baseline: apsBaseline,
    rules,
    mode: "straight",
    targetPlan: null,
    implementationKind: "standard",
  });

  it("keeps the contract exactly as it is", () => {
    expect(out.applicable).toBe(false);
    expect(out.items).toEqual([]);
    expect(out.blockers).toEqual([]);
  });

  it("still exposes the entitlement breakdown", () => {
    expect(out.currentEntitlements.web.billable).toBe(3);
    expect(out.currentEntitlements.web.total).toBe(4);
  });
});

describe("downgrade", () => {
  const out = computePlanChange({
    baseline: {
      ...apsBaseline,
      plan: 3,
      currentRecurring: 2520,
      recurringLines: [
        { key: "l1", label: "Professional 3 — annual license", lineType: "license", amount: 1800, needsReview: false },
        { key: "l2", label: "ManWinWin WEB — 4 accesses", lineType: "mww_web", amount: 720, needsReview: false },
      ],
    },
    rules,
    mode: "downgrade",
    targetPlan: 1,
    implementationKind: "standard",
    transitionRules,
  });

  it("charges no implementation", () => {
    expect(out.implementationGross).toBe(0);
    expect(out.items.some((i) => i.change_kind === "implementation_delta")).toBe(false);
  });

  it("preserves capacity and re-bills only the additions", () => {
    expect(out.proposedEntitlements.web.total).toBe(4);
    expect(out.proposedEntitlements.web.billable).toBe(3);
    expect(out.proposedRecurring).toBe(936 + 720);
    expect(out.recurringDelta).toBe(936 + 720 - 2520);
    expect(out.year1).toBe(1656);
  });
});

describe("product family changes", () => {
  const businessBaseline: RenewalBaseline = {
    ...apsBaseline,
    productFamily: "Business",
    product: "Business UseIT",
    plan: null,
    backofficeUsers: 5,
    webUsers: 4,
    currentRecurring: 4000,
    recurringLines: [
      { key: "l1", label: "ManWinWin Business — annual license", lineType: "license", amount: 3000, needsReview: false },
      { key: "l2", label: "Web accesses", lineType: "mww_web", amount: 1000, needsReview: false },
    ],
  };

  it("Professional → Business preserves capacity and applies Business inclusions", () => {
    const out = computePlanChange({
      baseline: { ...apsBaseline, backofficeUsers: 5, webUsers: 4 },
      rules,
      mode: "upgrade",
      targetPlan: null,
      targetFamily: "Business",
      targetLicenseAnnualPrice: 3000,
      variant: "useit",
      implementationKind: "standard",
      transitionRules: [
        {
          id: "tr-pro-bus",
          code: "TR_PRO_BUS",
          label: "Professional → Business",
          source_family: "Professional",
          target_family: "Business",
          pricing_mode: "fixed",
          incremental_gross: 2500,
          active: true,
        },
      ],
    });
    expect(out.blockers).toEqual([]);
    expect(out.proposedEntitlements.backoffice.included).toBe(3);
    expect(out.proposedEntitlements.backoffice.billable).toBe(2);
    expect(out.proposedEntitlements.web.billable).toBe(3);
    // 3000 license + 2×352 BO + 3×240 Web
    expect(out.proposedRecurring).toBe(3000 + 704 + 720);
    expect(out.implementationGross).toBe(2500);
  });

  it("Business → Professional keeps capacity, charges no implementation and blocks unpriced additions", () => {
    const out = computePlanChange({
      baseline: businessBaseline,
      rules,
      mode: "downgrade",
      targetPlan: 3,
      targetFamily: "Professional",
      implementationKind: "standard",
      transitionRules,
    });
    expect(out.proposedEntitlements.backoffice.included).toBe(1);
    expect(out.proposedEntitlements.backoffice.billable).toBe(4);
    expect(out.implementationGross).toBe(0);
    // Professional publishes no additional-BackOffice price: never invented.
    expect(out.blockers.join(" ")).toContain("No published price for additional BackOffice accesses");
  });
});

describe("no additions", () => {
  it("bills only the target license", () => {
    const out = computePlanChange({
      baseline: {
        ...apsBaseline,
        backofficeUsers: 1,
        webUsers: 1,
        currentRecurring: 696,
        recurringLines: [
          { key: "l1", label: "Professional 1 — annual license", lineType: "license", amount: 696, needsReview: false },
        ],
      },
      rules,
      mode: "upgrade",
      targetPlan: 3,
      implementationKind: "standard",
      transitionRules,
    });
    expect(out.billableAccessTotal).toBe(0);
    expect(out.items.some((i) => i.change_kind === "access_addition")).toBe(false);
    expect(out.proposedRecurring).toBe(1800);
  });
});

describe("unpriced additions and inconsistencies", () => {
  it("blocks when a billable BackOffice addition has no published price", () => {
    const out = computePlanChange({
      baseline: { ...apsBaseline, backofficeUsers: 3 },
      rules,
      mode: "upgrade",
      targetPlan: 3,
      implementationKind: "standard",
      transitionRules,
    });
    expect(out.blockers.join(" ")).toContain("No published price for additional BackOffice accesses");
  });

  it("warns instead of crediting when the total is below the included minimum", () => {
    const out = computePlanChange({
      baseline: { ...apsBaseline, webUsers: 0 },
      rules,
      mode: "upgrade",
      targetPlan: 3,
      implementationKind: "standard",
      transitionRules,
    });
    expect(out.proposedEntitlements.web.billable).toBe(0);
    expect(out.warnings.join(" ")).toContain("below the 1 included");
    expect(out.proposedRecurring).toBe(1800);
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
      transitionRules,
    });
    expect(out.blockers[0]).toContain("current Professional plan is not recorded");
    expect(out.items).toEqual([]);
  });

  it("requires a target plan", () => {
    const out = upgrade({ targetPlan: null });
    expect(out.blockers.join(" ")).toContain("Select the target Professional plan");
  });

  it("rejects an upgrade to the same plan", () => {
    const out = upgrade({ targetPlan: 1 });
    expect(out.blockers.join(" ")).toContain("same as the current plan");
  });

  it("blocks when no core license line exists in the contract", () => {
    const out = upgrade({ baseline: { ...apsBaseline, recurringLines: [apsBaseline.recurringLines[1]] } });
    expect(out.blockers.join(" ")).toContain("No core license line");
  });

  it("resolves catalogue rules by exact code", () => {
    expect(planLicenseRule(rules, 2)?.code).toBe("plan_2_annual");
  });

  it("allows a discount only on the incremental implementation line", () => {
    const out = upgrade();
    expect(validatePlanChangeDiscounts(out.items).ok).toBe(true);

    for (const kind of ["plan_change", "access_addition"]) {
      const tampered = out.items.map((i) =>
        i.change_kind === kind ? { ...i, discount_type: "percent" as const, discount_value: 10 } : i,
      );
      const res = validatePlanChangeDiscounts(tampered);
      expect(res.ok).toBe(false);
      expect(res.message).toContain("never recurring software");
    }
  });

  it("caps a fixed discount at the incremental gross", () => {
    expect(implementationDiscountAmount(1650, { type: "fixed", value: 5000 })).toBe(1650);
    expect(implementationDiscountAmount(1650, { type: "fixed", value: 200 })).toBe(200);
    expect(implementationDiscountAmount(0, { type: "percent", value: 50 })).toBe(0);
  });
});
