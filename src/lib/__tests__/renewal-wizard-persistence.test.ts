/**
 * Isolated end-to-end wizard persistence tests.
 *
 * Simulates the full renewal proposal loop with fixture data only (no DB, no
 * rendered dialog):
 *   compute plan change  →  persist rows  →  close dialog  →  reopen from the
 *   persisted proposal  →  recompute with the stored change definition.
 *
 * Guarantees:
 *  - every computed line reaches `proposal_items` with the right money;
 *  - the structured provenance columns survive the round trip;
 *  - reopening does not drift (same items, same rows, byte-for-byte).
 */

import { describe, it, expect } from "vitest";
import { computePlanChange, type RenewalChangeMode } from "@/lib/renewal-plan-change";
import { buildBaselineProposalItems, type RenewalBaseline } from "@/lib/renewal-baseline";
import {
  buildProposalItemRows,
  proposalItemFromRow,
  PROPOSAL_ITEM_PROVENANCE_FIELDS,
} from "@/lib/proposal-item-rows";
import type { PricingRule, ProposalItem, ProposalPlan } from "@/types/proposal";

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

const rules: PricingRule[] = [
  r("plan_1_annual", "ManWinWin Professional - Plan 1 (annual license)", "software", 936),
  r("plan_2_annual", "ManWinWin Professional - Plan 2 (annual license)", "software", 1296),
  r("plan_3_annual", "ManWinWin Professional - Plan 3 (annual license)", "software", 1800),
  r("impl_online_p1", "Online Implementation - Plan 1", "service", 1890),
  r("impl_online_p3", "Online Implementation - Plan 3", "service", 3590),
];

/** APS-equivalent fixture — isolated, never real data. */
const baseline: RenewalBaseline = {
  hasRealData: true,
  renewalId: "ren-fixture",
  clientId: "cli-fixture",
  contractId: "con-fixture",
  licenseId: "lic-fixture",
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
} as RenewalBaseline;

/** In-memory stand-in for `proposals` + `proposal_items`. */
interface SavedProposal {
  id: string;
  plan: ProposalPlan | null;
  renewal_change_mode: RenewalChangeMode;
  source_plan: ProposalPlan | null;
  target_plan: ProposalPlan | null;
  items: ProposalItem[];
  rows: Record<string, unknown>[];
}

/** Wizard session: compute the lines the dialog would show and save them. */
function runWizard(opts: {
  mode: RenewalChangeMode;
  targetPlan: ProposalPlan | null;
  implementationDiscountPct?: number;
}) {
  const computation = computePlanChange({
    baseline,
    rules,
    mode: opts.mode,
    targetPlan: opts.targetPlan,
    implementationKind: "standard",
    implementationDiscount: { type: "percent", value: opts.implementationDiscountPct ?? 0 },
  });
  const items =
    computation.applicable && computation.blockers.length === 0
      ? computation.items
      : buildBaselineProposalItems(baseline);
  return { computation, items };
}

function persist(items: ProposalItem[], computation: ReturnType<typeof runWizard>["computation"], mode: RenewalChangeMode): SavedProposal {
  const rows = buildProposalItemRows(items, "prop-1");
  return {
    id: "prop-1",
    plan: computation.applicable ? computation.targetPlan : baseline.plan,
    renewal_change_mode: computation.applicable ? mode : "straight",
    source_plan: computation.applicable ? computation.currentPlan : null,
    target_plan: computation.applicable ? computation.targetPlan : null,
    // What the dialog reads back on reopen (`editingProposal.items`).
    items: rows.map(proposalItemFromRow),
    rows,
  };
}

describe("wizard end-to-end — upgrade P1 → P3 with 50% implementation discount", () => {
  const first = runWizard({ mode: "upgrade", targetPlan: 3, implementationDiscountPct: 50 });
  const saved = persist(first.items, first.computation, "upgrade");

  it("computes the accepted commercial outcome", () => {
    expect(first.computation.blockers).toEqual([]);
    expect(first.computation.proposedRecurring).toBe(2760);
    expect(first.computation.recurringDelta).toBe(1104);
    expect(first.computation.implementationNet).toBe(850);
  });

  it("persists every computed line with its money intact", () => {
    expect(saved.rows.length).toBe(first.items.length);
    saved.rows.forEach((row, idx) => {
      expect(row.proposal_id).toBe("prop-1");
      expect(row.sort_order).toBe(idx);
      expect(row.item_code).toBe(first.items[idx].item_code);
    });
    const recurringTotal = saved.rows
      .filter((row) => row.is_recurring)
      .reduce((sum, row) => sum + Number(row.net_total), 0);
    expect(recurringTotal).toBe(2760);
    const oneOffTotal = saved.rows
      .filter((row) => !row.is_recurring)
      .reduce((sum, row) => sum + Number(row.net_total), 0);
    expect(oneOffTotal).toBe(850);
    expect(recurringTotal + oneOffTotal).toBe(3610); // Year 1
  });

  it("persists the incremental implementation line as a delta, never the full price", () => {
    const impl = saved.rows.find((row) => row.change_kind === "implementation_delta");
    expect(impl).toBeTruthy();
    expect(Number(impl!.gross_total)).toBe(1700);
    expect(Number(impl!.gross_delta)).toBe(1700);
    expect(Number(impl!.net_total)).toBe(850);
    expect(Number(impl!.gross_total)).not.toBe(3590);
  });

  it("keeps provenance on the reopened items", () => {
    const reopened = saved.items;
    reopened.forEach((item, idx) => {
      for (const field of PROPOSAL_ITEM_PROVENANCE_FIELDS) {
        expect(item[field as keyof ProposalItem] ?? null).toEqual(
          (first.items[idx] as any)[field] ?? null,
        );
      }
    });
    const impl = reopened.find((item) => item.change_kind === "implementation_delta")!;
    expect(impl.change_kind).toBe("implementation_delta");
    expect(impl.source_plan).toBe(1);
    expect(impl.target_plan).toBe(3);
    expect(impl.pricing_rule_code).toBe("impl_online_p3");
  });

  it("survives close + reopen without recomputation drift", () => {
    // Reopen: the dialog restores mode/target from the saved proposal and
    // recomputes; the first pass must not overwrite the stored lines.
    const reopenedComputation = computePlanChange({
      baseline,
      rules,
      mode: saved.renewal_change_mode,
      targetPlan: saved.target_plan,
      implementationKind: "standard",
      implementationDiscount: { type: "percent", value: 50 },
    });
    expect(reopenedComputation.proposedRecurring).toBe(first.computation.proposedRecurring);
    expect(reopenedComputation.recurringDelta).toBe(first.computation.recurringDelta);
    expect(reopenedComputation.implementationNet).toBe(first.computation.implementationNet);

    // Re-saving the reopened items produces identical rows (idempotent write).
    const resaved = buildProposalItemRows(saved.items, "prop-1");
    expect(resaved).toEqual(saved.rows);
  });
});

describe("wizard end-to-end — straight renewal", () => {
  const first = runWizard({ mode: "straight", targetPlan: null });
  const saved = persist(first.items, first.computation, "straight");

  it("persists the contract baseline unchanged", () => {
    expect(first.computation.applicable).toBe(false);
    const recurring = saved.rows.reduce((sum, row) => sum + Number(row.net_total), 0);
    expect(recurring).toBe(1656);
    expect(saved.rows.every((row) => row.change_kind === null)).toBe(true);
  });

  it("reopens and re-saves without drift", () => {
    expect(buildProposalItemRows(saved.items, "prop-1")).toEqual(saved.rows);
  });
});

describe("wizard end-to-end — downgrade P3 → P1", () => {
  const p3Baseline: RenewalBaseline = {
    ...baseline,
    plan: 3,
    product: "Professional 3",
    variantLabel: "Professional 3",
    currentRecurring: 2760,
    recurringLines: [
      { key: "l1", label: "ManWinWin Professional 3 — annual license", lineType: "license", amount: 1800, needsReview: false },
      { key: "l2", label: "ManWinWin WEB — 4 accesses", lineType: "mww_web", amount: 960, needsReview: false },
    ],
  } as RenewalBaseline;

  const computation = computePlanChange({
    baseline: p3Baseline,
    rules,
    mode: "downgrade",
    targetPlan: 1,
    implementationKind: "standard",
  });
  const rows = buildProposalItemRows(computation.items, "prop-2");

  it("persists no implementation line and a negative recurring delta", () => {
    expect(computation.blockers).toEqual([]);
    expect(computation.recurringDelta).toBeLessThan(0);
    expect(rows.some((row) => row.change_kind === "implementation_delta")).toBe(false);
    expect(rows.every((row) => row.change_kind === "plan_change" || row.change_kind === "unchanged")).toBe(true);
  });

  it("round-trips provenance through persistence", () => {
    const reopened = rows.map(proposalItemFromRow);
    expect(buildProposalItemRows(reopened, "prop-2")).toEqual(rows);
  });
});
