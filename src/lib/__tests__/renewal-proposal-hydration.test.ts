/**
 * Regression tests for reopening a persisted renewal proposal.
 *
 * Production defect: reopening the APS upgrade rendered a straight renewal of
 * €1,656 and lost the manual incremental implementation, its 50% discount and
 * the justification — risking an overwrite of correct persisted data.
 */

import { describe, it, expect } from "vitest";
import {
  hydrateRenewalProposal,
  assertSafeRenewalOverwrite,
} from "@/lib/renewal-proposal-hydration";
import type { ProposalItem } from "@/types/proposal";

const item = (o: Partial<ProposalItem>): ProposalItem =>
  ({
    category: "software",
    item_code: "x",
    item_name: "x",
    qty: 1,
    unit_price: 0,
    frequency: "yearly",
    total: 0,
    discount_type: "none",
    discount_value: 0,
    gross_total: 0,
    discount_amount: 0,
    net_total: 0,
    is_override: false,
    is_recurring: true,
    apply_discount_to_renewal: false,
    sort_order: 0,
    ...o,
  }) as ProposalItem;

/** APS-equivalent persisted proposal (isolated fixture, never real data). */
const apsItems: ProposalItem[] = [
  item({
    item_code: "plan_3_annual",
    item_name: "ManWinWin Professional 3 — annual license",
    unit_price: 1800,
    total: 1800,
    gross_total: 1800,
    net_total: 1800,
    change_kind: "plan_change",
    source_plan: 1,
    target_plan: 3,
    sort_order: 0,
  }),
  item({
    category: "addon",
    item_code: "web_user",
    item_name: "ManWinWin WEB — additional accesses",
    qty: 3,
    unit_price: 240,
    total: 720,
    gross_total: 720,
    net_total: 720,
    change_kind: "access_addition",
    access_type: "web",
    total_licensed_qty: 4,
    included_qty: 1,
    billable_qty: 3,
    sort_order: 1,
  }),
  item({
    category: "service",
    item_code: "impl_incremental_standard",
    item_name: "Incremental implementation",
    unit_price: 1650,
    total: 1650,
    gross_total: 1650,
    discount_type: "percent",
    discount_value: 50,
    discount_amount: 825,
    net_total: 825,
    is_recurring: false,
    change_kind: "implementation_delta",
    implementation_source: "manual_hq",
    justification: "Confirmed incremental effort for the P1 → P3 transition.",
    source_plan: 1,
    target_plan: 3,
    sort_order: 2,
  }),
];

const apsProposal = {
  id: "bb8f3f2e-0000-0000-0000-000000000000",
  plan: 3,
  renewal_change_mode: "upgrade",
  source_plan: 1,
  target_plan: 3,
  implementation_source: "manual_hq",
  implementation_gross: 1650,
  implementation_discount_amount: 825,
  implementation_net: 825,
  implementation_justification: "Confirmed incremental effort for the P1 → P3 transition.",
  total_recurring: 2520,
  total_year_1: 3345,
};

describe("hydrateRenewalProposal — APS upgrade round trip", () => {
  const h = hydrateRenewalProposal({ proposal: apsProposal, items: apsItems });

  it("never renders a persisted upgrade as a straight renewal", () => {
    expect(h.isRenewalChange).toBe(true);
    expect(h.changeMode).toBe("upgrade");
    expect(h.sourcePlan).toBe(1);
    expect(h.targetPlan).toBe(3);
    expect(h.totalRecurring).toBe(2520);
    expect(h.totalYear1).toBe(3345);
    expect(h.totalRecurring).not.toBe(1656);
  });

  it("restores the manual implementation, discount and justification", () => {
    expect(h.implementationSource).toBe("manual_hq");
    expect(h.implementationGross).toBe(1650);
    expect(h.implementationDiscountPct).toBe(50);
    expect(h.implementationDiscountAmount).toBe(825);
    expect(h.implementationNet).toBe(825);
    expect(h.manualImplementationGross).toBe(1650);
    expect(h.implementationJustification).toContain("incremental effort");
    expect(h.complete).toBe(true);
    expect(h.missing).toEqual([]);
  });

  it("restores the entitlement split without double billing included accesses", () => {
    expect(h.accessLines).toEqual([
      {
        accessType: "web",
        totalLicensedQty: 4,
        includedQty: 1,
        billableQty: 3,
        unitPrice: 240,
        netTotal: 720,
      },
    ]);
  });
});

describe("hydrateRenewalProposal — backwards compatibility", () => {
  it("derives the change definition from items when the columns are absent", () => {
    const h = hydrateRenewalProposal({
      proposal: { id: "legacy", renewal_change_mode: "straight" },
      items: apsItems,
    });
    expect(h.changeMode).toBe("upgrade");
    expect(h.sourcePlan).toBe(1);
    expect(h.targetPlan).toBe(3);
    expect(h.implementationGross).toBe(1650);
    expect(h.implementationDiscountPct).toBe(50);
    expect(h.derivedFromItems).toBe(true);
    expect(h.complete).toBe(true);
  });

  it("derives the discount % from amounts when no percent discount is stored", () => {
    const h = hydrateRenewalProposal({
      proposal: { id: "p", renewal_change_mode: "upgrade", source_plan: 1, target_plan: 3 },
      items: [
        apsItems[0],
        apsItems[1],
        item({
          ...apsItems[2],
          discount_type: "amount",
          discount_value: 825,
          implementation_source: "transition_rule",
          transition_rule_code: "TR_P1_P3_STD",
        } as Partial<ProposalItem>),
      ],
    });
    expect(h.implementationDiscountPct).toBe(50);
    expect(h.implementationSource).toBe("transition_rule");
    expect(h.implementationTransitionRuleCode).toBe("TR_P1_P3_STD");
    expect(h.manualImplementationGross).toBeNull();
  });

  it("treats a genuine straight renewal as straight", () => {
    const h = hydrateRenewalProposal({
      proposal: { id: "s", renewal_change_mode: "straight", total_recurring: 1656 },
      items: [item({ item_code: "l1", total: 1656, net_total: 1656 })],
    });
    expect(h.isRenewalChange).toBe(false);
    expect(h.complete).toBe(true);
  });

  it("fails closed when an upgrade cannot be fully restored", () => {
    const h = hydrateRenewalProposal({
      proposal: { id: "broken", renewal_change_mode: "upgrade", source_plan: 1, target_plan: 3 },
      items: [
        apsItems[0],
        item({ ...apsItems[2], gross_total: 0, total: 0, net_total: 0, implementation_source: null } as Partial<ProposalItem>),
      ],
    });
    expect(h.complete).toBe(false);
    expect(h.missing.length).toBeGreaterThan(0);
  });
});

describe("assertSafeRenewalOverwrite", () => {
  const h = hydrateRenewalProposal({ proposal: apsProposal, items: apsItems });

  it("allows a save that still represents the persisted upgrade", () => {
    expect(
      assertSafeRenewalOverwrite({
        hydration: h,
        currentMode: "upgrade",
        currentTargetPlan: 3,
        currentImplementationGross: 1650,
        itemCount: 3,
      }).ok,
    ).toBe(true);
  });

  it("blocks a straight-renewal overwrite of a persisted upgrade", () => {
    const res = assertSafeRenewalOverwrite({
      hydration: h,
      currentMode: "straight",
      currentTargetPlan: null,
      currentImplementationGross: null,
      itemCount: 2,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("upgrade");
  });

  it("blocks a save that lost the incremental implementation", () => {
    const res = assertSafeRenewalOverwrite({
      hydration: h,
      currentMode: "upgrade",
      currentTargetPlan: 3,
      currentImplementationGross: 0,
      itemCount: 3,
    });
    expect(res.ok).toBe(false);
  });

  it("blocks a save when hydration was incomplete", () => {
    const broken = hydrateRenewalProposal({
      proposal: { id: "b", renewal_change_mode: "upgrade" },
      items: [],
    });
    expect(
      assertSafeRenewalOverwrite({
        hydration: broken,
        currentMode: "upgrade",
        currentTargetPlan: 3,
        currentImplementationGross: 1650,
        itemCount: 0,
      }).ok,
    ).toBe(false);
  });

  it("never blocks a new or straight proposal", () => {
    expect(
      assertSafeRenewalOverwrite({
        hydration: null,
        currentMode: "straight",
        currentTargetPlan: null,
        currentImplementationGross: null,
        itemCount: 0,
      }).ok,
    ).toBe(true);
  });
});
