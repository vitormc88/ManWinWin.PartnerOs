import { describe, it, expect } from "vitest";
import {
  authDealValue, largestOpenDeals, aggregateWinRate, isRenewalOpen, isRenewalOverdue,
  renewalStatusDisplay, resolveRenewalOwner, rankByValue, kpiText, quarterEndInclusive,
  analyticsStageLabel, analyticsStageRows,
} from "../analytics-corrections";
import { ACTIVE_STAGES, PIPELINE_STAGES } from "@/data/pipeline-stages";
import { stageLabel } from "../pipeline-gates";

describe("Analytics shared Pipeline labels", () => {
  it.each(PIPELINE_STAGES)("uses the operational label for $key", (stage) => {
    expect(analyticsStageLabel(stage.key)).toBe(stageLabel(stage.key, stage.label));
  });
  it("keeps active order, includes zero Price Negotiation once, and preserves totals", () => {
    const input = [
      { stage: "Advance 1", deal_count: 2, total_value: 100, weighted_value: 70 },
      { stage: "Advance 1", deal_count: 1, total_value: 50, weighted_value: 35 },
      { stage: "Meeting 2", deal_count: 1, total_value: 200, weighted_value: 150 },
    ];
    const rows = analyticsStageRows(input);
    expect(rows.map((r) => r.stage)).toEqual(ACTIVE_STAGES.map((s) => s.key));
    expect(rows.find((r) => r.stage === "Price Negotiation")).toEqual({ stage: "Price Negotiation", deal_count: 0, total_value: 0, weighted_value: 0 });
    expect(rows.reduce((sum, r) => sum + r.deal_count, 0)).toBe(4);
    expect(rows.reduce((sum, r) => sum + r.total_value, 0)).toBe(350);
    expect(rows.reduce((sum, r) => sum + r.weighted_value, 0)).toBe(255);
    expect(input).toHaveLength(3);
  });
  it("includes every active stage when loaded empty and handles missing labels", () => {
    expect(analyticsStageRows([]).map((r) => analyticsStageLabel(r.stage))).toEqual([
      "Open Lead", "Qualified / Call Done", "Demo", "Proposal Sent", "Solution Alignment",
      "Clarifications & Validation", "Decision Path Confirmed", "Price Negotiation",
    ]);
    expect(analyticsStageLabel(null)).toBe("—");
    expect(analyticsStageLabel("unknown")).toBe("unknown");
  });
});

describe("analytics corrections", () => {
  it("zero total falls back to expected and ranks correctly", () => {
    expect(authDealValue({ total_value: 0, expected_value: 50000 })).toBe(50000);
    const top = largestOpenDeals([{ id: "a", total_value: 10000 }, { id: "b", total_value: 0, expected_value: 50000 }] as any[]);
    expect(top[0].id).toBe("b");
  });
  it("aggregate win rate is total won/(won+lost); none closed = null", () => {
    expect(aggregateWinRate([{ won_count: 1, lost_count: 0 }, { won_count: 1, lost_count: 9 }])).toBe(18);
    expect(aggregateWinRate([{ won_count: 0, lost_count: 0 }])).toBeNull();
  });
  it("Completed is excluded from open/overdue but not labelled Won", () => {
    const r = { status: "Completed", renewal_date: "2020-01-01" };
    expect(isRenewalOpen(r)).toBe(false);
    expect(isRenewalOverdue(r)).toBe(false);
    expect(renewalStatusDisplay("Completed").label).toBe("Completed");
    expect(isRenewalOverdue({ status: "Upcoming", renewal_date: "2020-01-01" })).toBe(true);
    expect(isRenewalOpen({ status: "Upcoming", closed_at: "2026-01-01" })).toBe(false);
  });
  it("Lost is labelled Lost", () => {
    expect(renewalStatusDisplay("Lost").label).toBe("Lost");
  });
  it("owner via assigned_user_id then assigned_owner fallback", () => {
    const p = new Map([["u1", { full_name: "Ana" }], ["u2", { full_name: "Rui" }]]);
    expect(resolveRenewalOwner({ assigned_user_id: "u1", assigned_owner: "u2" }, p)).toBe("Ana");
    expect(resolveRenewalOwner({ assigned_owner: "u2" }, p)).toBe("Rui");
    expect(resolveRenewalOwner({ assigned_owner: "Legacy Name" }, p)).toBe("Legacy Name");
  });
  it("insight ranking independent of table sort", () => {
    const rows = [{ name: "a", value: 1 }, { name: "b", value: 9 }];
    expect(rankByValue(rows)[0].name).toBe("b");
    expect(rankByValue([...rows].reverse())[0].name).toBe("b");
  });
  it("errors and loading are not zero", () => {
    expect(kpiText({ isError: true }, () => "0")).toBe("Unavailable");
    expect(kpiText({ isLoading: true }, () => "0")).toBe("…");
    expect(kpiText({}, () => "0")).toBe("0");
  });
  it("quarter end includes the whole last day", () => {
    const e = quarterEndInclusive(new Date(2026, 9, 5));
    expect(e.getMonth()).toBe(11); expect(e.getDate()).toBe(31); expect(e.getHours()).toBe(23);
  });
});

import { summarizeOpenRenewals, salespeopleBreakdown } from "../analytics-corrections";
describe("summarizeOpenRenewals", () => {
  const now = new Date("2026-10-06T12:00:00Z").getTime();
  const rows = [
    { id: "r1", status: "Upcoming", renewal_date: "2026-09-01", partner_id: "p1", estimated_value: 100 },
    { id: "derived-contract-a", status: "Expired", renewal_date: "2026-08-01", partner_id: "p1", estimated_value: 50 },
    { id: "derived-license-b", status: "Expired", renewal_date: "2026-07-01", partner_id: "p2", estimated_value: 0 },
    { id: "r1", status: "Upcoming", renewal_date: "2026-09-01", partner_id: "p1", estimated_value: 100 },
    { id: "r2", status: "Completed", renewal_date: "2026-08-01", partner_id: "p3" },
    { id: "r3", status: "Upcoming", renewal_date: "2026-08-01", outcome: "lost", partner_id: "p3" },
    { id: "r4", status: "Upcoming", renewal_date: "2026-11-01", partner_id: "p3", estimated_value: 10 },
    { id: "r5", status: "Upcoming", renewal_date: "2027-06-01", partner_id: "p3" },
  ];
  it("counts explicit + derived overdue, dedupes ids, excludes closed", () => {
    const s = summarizeOpenRenewals(rows, now);
    expect(s.overdueIds.sort()).toEqual(["derived-contract-a", "derived-license-b", "r1"]);
    expect(s.overdueValue).toBe(150);
    expect(s.partnersWithOverdue).toBe(2);
    expect(s.overdueByPartner.get("p1")).toBe(2);
    expect(s.upcoming90).toBe(1);
  });
  it("salespeople never merges by name", () => {
    expect(salespeopleBreakdown([{ user_id: "a" }, { user_id: "b" }, { user_id: null, is_unlinked: true }])).toEqual({ linked: 2, unlinked: 1, rows: 3 });
  });
});
