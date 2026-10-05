import { describe, it, expect } from "vitest";
import {
  authDealValue, largestOpenDeals, aggregateWinRate, isRenewalOpen, isRenewalOverdue,
  renewalStatusDisplay, resolveRenewalOwner, rankByValue, kpiText, quarterEndInclusive,
} from "../analytics-corrections";

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
