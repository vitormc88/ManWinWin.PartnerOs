import { describe, it, expect } from "vitest";
import { availableProposalActions, proposalStatusLabel, workflowErrorMessages, blockingIssues, downloadChangesStatus } from "@/lib/proposal-workflow";
import { suppressDerivedForClosedCycles, isDateCoveredByClosedCycle, isPerpetualKeepIt, selectActiveCycle } from "@/lib/renewal-active-cycle";

describe("proposal workflow", () => {
  it("labels renewal Ready as Validated only for renewals", () => {
    expect(proposalStatusLabel("Ready", true)).toBe("Validated");
    expect(proposalStatusLabel("Ready", false)).toBe("Ready");
  });
  it("offers explicit actions per status", () => {
    expect(availableProposalActions({ status: "Draft" })).toEqual(["validate"]);
    expect(availableProposalActions({ status: "Ready", renewal_id: "r" })).toEqual(["mark_sent", "record_acceptance"]);
    expect(availableProposalActions({ status: "Ready", deal_id: "d" } as any)).toEqual(["mark_sent"]);
    expect(availableProposalActions({ status: "Sent", renewal_id: "r" })).toEqual(["record_acceptance"]);
    expect(availableProposalActions({ status: "Accepted", renewal_id: "r" })).toEqual([]);
  });
  it("downloads never change status", () => expect(downloadChangesStatus()).toBe(false));
  it("splits validation failures into messages", () => {
    expect(workflowErrorMessages({ message: "VALIDATION_FAILED: A. | B." })).toEqual(["A.", "B."]);
  });
  it("only blocks when enforced", () => {
    const issues = [{ code: "X", message: "m" }];
    expect(blockingIssues({ enforced: false, issues } as any)).toEqual([]);
    expect(blockingIssues({ enforced: true, issues } as any)).toHaveLength(1);
  });
});

describe("closed cycles stay closed", () => {
  const lost = { id: "r1", status: "Lost", closed_at: "2026-01-01", renewal_date: "2026-03-31" };
  for (const src of ["contract", "license", "sat"]) {
    it(`suppresses same-period derived ${src} row`, () => {
      const d = { id: `derived-${src}-x`, status: "Expired", renewal_date: "2026-04-15" };
      const out = suppressDerivedForClosedCycles([lost, d]);
      expect(out).toEqual([lost]);
      expect(selectActiveCycle(out)!.isClosed).toBe(true);
    });
  }
  it("keeps a genuine later period visible", () => {
    const later = { id: "derived-contract-y", status: "Upcoming", renewal_date: "2027-03-31" };
    const out = suppressDerivedForClosedCycles([lost, later]);
    expect(selectActiveCycle(out)!.primary).toBe(later);
  });
  it("covers fallback dates", () => {
    expect(isDateCoveredByClosedCycle("2026-03-31", [lost])).toBe(true);
    expect(isDateCoveredByClosedCycle("2027-03-31", [lost])).toBe(false);
  });
  it("KeepIT perpetual is recognised, KeepIT SaaS is not", () => {
    expect(isPerpetualKeepIt({ product: "KeepIT Business" })).toBe(true);
    expect(isPerpetualKeepIt({ product: "KeepIT SaaS" })).toBe(false);
  });
});
