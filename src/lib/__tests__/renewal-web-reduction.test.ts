import { describe, expect, it } from "vitest";
import { buildBaselineProposalItems, type RenewalBaseline } from "../renewal-baseline";
import { calculateWebReduction } from "../renewal-web-reduction";
import { computeTotals } from "../proposal-engine";

const annual = (label: string, amount: number, lineType = "recurring") => ({
  key: label, label, amount, lineType, declaredType: lineType, needsReview: false,
});
const baseline = {
  webUsers: 7, includedWebUsers: 1, currentRecurring: 3240,
  recurringLines: [annual("Annual licence / S&AT", 3240)],
} as RenewalBaseline;

describe("same-plan WEB reduction", () => {
  it("preserves the included seat and the agreed bundled renewal amount", () => {
    const items = buildBaselineProposalItems(baseline);
    const draft = calculateWebReduction(baseline, { billable: 0, annual: "1800", reason: "Agreed at renewal" }, items)!;
    expect(draft.ready).toBe(true);
    expect(draft.entitlements.web).toEqual({ total: 1, included: 1, billable: 0 });
    expect(computeTotals(draft.items).totalRecurring).toBe(1800);
    expect(computeTotals(items).totalRecurring).toBe(3240);
  });

  it("reduces only the explicitly priced WEB line, including removal of all billable accesses", () => {
    const split = { ...baseline, recurringLines: [annual("Licence", 1800), annual("WEB", 1440, "mww_web")] };
    const items = buildBaselineProposalItems(split);
    for (const [billable, expected] of [[2, 2280], [0, 1800]]) {
      const proposal = calculateWebReduction(split, { billable, annual: "", reason: "" }, items)!;
      expect(proposal.ready).toBe(true);
      expect(computeTotals(proposal.items).totalRecurring).toBe(expected);
    }
  });

  it("retains a draft price awaiting justification and rejects invalid quantities", () => {
    const items = buildBaselineProposalItems(baseline);
    const draft = calculateWebReduction(baseline, { billable: 0, annual: "1800", reason: "" }, items)!;
    expect(draft.ready).toBe(false);
    expect(draft.entitlements.web_reduction.annual).toBe(1800);
    expect(draft.items).toBe(items);
    expect(calculateWebReduction(baseline, { billable: -1, annual: "1800", reason: "" }, items)).toBeNull();
  });
});
