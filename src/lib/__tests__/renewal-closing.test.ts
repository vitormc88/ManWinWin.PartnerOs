import { describe, it, expect } from "vitest";
import {
  evaluateRenewalClosure,
  nextRenewalDateFrom,
  contractEndBefore,
  isClosedRenewal,
  isOperationalRenewal,
  renewalClosureRefreshKeys,
} from "../renewal-closing";

const openRenewal = {
  id: "33000000-0000-4000-a000-000000000002",
  status: "Due Soon",
  renewal_date: "2026-03-01",
  billing_frequency: "Annual",
};

const readyProposal = {
  id: "p1",
  status: "Ready",
  product_family: "Business",
  license_model: "useit",
  total_recurring: 39600,
  total_year_1: 42600,
};

describe("date derivation", () => {
  it("derives the next cycle from the billing frequency", () => {
    expect(nextRenewalDateFrom("2026-03-01", "Annual")).toBe("2027-03-01");
    expect(nextRenewalDateFrom("2026-03-01", "monthly")).toBe("2026-04-01");
    expect(nextRenewalDateFrom("2026-03-01", "Quarterly")).toBe("2026-06-01");
    expect(nextRenewalDateFrom("2026-01-31", "semiannual")).toBe("2026-07-31");
  });
  it("never assumes annual for irregular, multi-year or unknown periods", () => {
    expect(nextRenewalDateFrom("2026-03-01", null)).toBeNull();
    expect(nextRenewalDateFrom("2026-03-01", "Multi-year")).toBeNull();
    expect(nextRenewalDateFrom("2026-03-01", "weird")).toBeNull();
  });
  it("requires an explicit next date when the period is irregular", () => {
    const preview = evaluateRenewalClosure({
      renewal: { id: "r1", status: "Upcoming", renewal_date: "2026-03-01", billing_frequency: "Multi-year" },
      proposal: { id: "p1", status: "Ready", product_family: "Professional", total_recurring: 1000, total_year_1: 1000 },
      previousRecurringValue: 900,
      outcome: "renewed",
    });
    expect(preview.ok).toBe(false);
    expect(preview.blockers.some((b) => b.includes("next renewal date"))).toBe(true);
    expect(
      evaluateRenewalClosure({
        renewal: { id: "r1", status: "Upcoming", renewal_date: "2026-03-01", billing_frequency: "Multi-year" },
        proposal: { id: "p1", status: "Ready", product_family: "Professional", total_recurring: 1000, total_year_1: 1000 },
        previousRecurringValue: 900,
        outcome: "renewed",
        nextRenewalDate: "2028-03-01",
      }).ok
    ).toBe(true);
  });

  it("returns null without an effective date", () => {
    expect(nextRenewalDateFrom(null, "Annual")).toBeNull();
  });
  it("ends the contract the day before the next cycle", () => {
    expect(contractEndBefore("2027-03-01")).toBe("2027-02-28");
    expect(contractEndBefore("2028-03-01")).toBe("2028-02-29");
  });
});

describe("closed detection", () => {
  it("treats Won/Lost/Completed and closed_at as closed", () => {
    expect(isClosedRenewal({ status: "Won" })).toBe(true);
    expect(isClosedRenewal({ status: "Lost" })).toBe(true);
    expect(isClosedRenewal({ status: "Completed" })).toBe(true);
    expect(isClosedRenewal({ status: "Due Soon", closed_at: "2026-03-01T00:00:00Z" })).toBe(true);
    expect(isClosedRenewal({ status: "Due Soon" })).toBe(false);
    expect(isClosedRenewal(null)).toBe(false);
  });
  it("rejects derived renewals", () => {
    expect(isOperationalRenewal("derived-abc")).toBe(false);
    expect(isOperationalRenewal(openRenewal.id)).toBe(true);
  });
});

describe("evaluateRenewalClosure — renewed", () => {
  it("computes values, delta and dates for a valid closure", () => {
    const p = evaluateRenewalClosure({
      renewal: openRenewal,
      proposal: readyProposal,
      previousRecurringValue: 36000,
      outcome: "renewed",
    });
    expect(p.ok).toBe(true);
    expect(p.blockers).toEqual([]);
    expect(p.effectiveDate).toBe("2026-03-01");
    expect(p.nextRenewalDate).toBe("2027-03-01");
    expect(p.contractEndDate).toBe("2027-02-28");
    expect(p.previousRecurring).toBe(36000);
    expect(p.renewedRecurring).toBe(39600);
    expect(p.oneTimeValue).toBe(3000);
    expect(p.deltaValue).toBe(3600);
    expect(p.deltaPct).toBeCloseTo(10, 6);
  });

  it("never produces a negative one-time value", () => {
    const p = evaluateRenewalClosure({
      renewal: openRenewal,
      proposal: { ...readyProposal, total_recurring: 50000, total_year_1: 40000 },
      previousRecurringValue: 36000,
      outcome: "renewed",
    });
    expect(p.oneTimeValue).toBe(0);
  });

  it("blocks a Draft proposal", () => {
    const p = evaluateRenewalClosure({
      renewal: openRenewal,
      proposal: { ...readyProposal, status: "Draft" },
      previousRecurringValue: 36000,
      outcome: "renewed",
    });
    expect(p.ok).toBe(false);
    expect(p.blockers.join(" ")).toMatch(/Ready or later/);
  });

  it("blocks an unresolved Business variant", () => {
    const p = evaluateRenewalClosure({
      renewal: openRenewal,
      proposal: { ...readyProposal, license_model: null },
      previousRecurringValue: 36000,
      outcome: "renewed",
    });
    expect(p.ok).toBe(false);
    expect(p.blockers.join(" ")).toMatch(/variant/i);
  });

  it("blocks when there is no proposal, no value or no contract", () => {
    expect(
      evaluateRenewalClosure({
        renewal: openRenewal,
        proposal: null,
        previousRecurringValue: 0,
        outcome: "renewed",
      }).blockers.join(" ")
    ).toMatch(/No renewal proposal/);

    expect(
      evaluateRenewalClosure({
        renewal: openRenewal,
        proposal: { ...readyProposal, total_year_1: 0 },
        previousRecurringValue: 0,
        outcome: "renewed",
      }).blockers.join(" ")
    ).toMatch(/no commercial value/);

    expect(
      evaluateRenewalClosure({
        renewal: openRenewal,
        proposal: readyProposal,
        previousRecurringValue: 0,
        outcome: "renewed",
        hasContract: false,
      }).blockers.join(" ")
    ).toMatch(/No contract/);
  });

  it("blocks an already closed renewal and derived renewals", () => {
    expect(
      evaluateRenewalClosure({
        renewal: { ...openRenewal, status: "Won", closed_at: "2026-03-01T10:00:00Z" },
        proposal: readyProposal,
        previousRecurringValue: 36000,
        outcome: "renewed",
      }).blockers.join(" ")
    ).toMatch(/already closed/);

    expect(
      evaluateRenewalClosure({
        renewal: { ...openRenewal, id: "derived-x" },
        proposal: readyProposal,
        previousRecurringValue: 36000,
        outcome: "renewed",
      }).blockers.join(" ")
    ).toMatch(/derived/);
  });

  it("blocks a next date that is not after the effective date", () => {
    const p = evaluateRenewalClosure({
      renewal: openRenewal,
      proposal: readyProposal,
      previousRecurringValue: 36000,
      outcome: "renewed",
      nextRenewalDate: "2026-02-01",
    });
    expect(p.ok).toBe(false);
    expect(p.blockers.join(" ")).toMatch(/after the effective date/);
  });
});

describe("evaluateRenewalClosure — lost", () => {
  it("requires a loss reason and creates no next cycle", () => {
    const bad = evaluateRenewalClosure({
      renewal: openRenewal,
      proposal: null,
      previousRecurringValue: 36000,
      outcome: "lost",
    });
    expect(bad.ok).toBe(false);
    expect(bad.blockers.join(" ")).toMatch(/loss reason/i);

    const good = evaluateRenewalClosure({
      renewal: openRenewal,
      proposal: null,
      previousRecurringValue: 36000,
      outcome: "lost",
      lossReason: "Budget cut",
    });
    expect(good.ok).toBe(true);
    expect(good.nextRenewalDate).toBeNull();
    expect(good.renewedRecurring).toBe(0);
    expect(good.oneTimeValue).toBe(0);
  });

  it("does not require a proposal to close as Lost", () => {
    const p = evaluateRenewalClosure({
      renewal: openRenewal,
      proposal: null,
      previousRecurringValue: 0,
      outcome: "lost",
      lossReason: "Churn",
    });
    expect(p.blockers).toEqual([]);
  });
});

describe("cache invalidation surface", () => {
  it("refreshes renewals, contracts, client and analytics surfaces", () => {
    const keys = renewalClosureRefreshKeys("r1", "c1").map((k) => k.join("/"));
    expect(keys).toContain("renewals");
    expect(keys).toContain("contracts");
    expect(keys).toContain("client/c1");
    expect(keys).toContain("analytics");
    expect(keys).toContain("dashboard");
  });
});
