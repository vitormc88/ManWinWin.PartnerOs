import { describe, it, expect } from "vitest";
import {
  periodBounds,
  comparisonBounds,
  revenueTotals,
  revenueSeries,
  dashboardRenewals,
  partnerHealthRows,
  atRiskHealth,
  pipelineForecast,
  type RevenueEntry,
} from "../dashboard-metrics";
const now = new Date(2026, 9, 9, 23);
const row = (
  date: string,
  amount: number,
  type = "initial_sale",
  extra: Partial<RevenueEntry> = {},
): RevenueEntry => ({
  id: date,
  client_id: "c",
  partner_id: "p",
  currency: "EUR",
  amount,
  revenue_date: date,
  revenue_type: type,
  renewal_id: null,
  ...extra,
});
describe("Dashboard commercial periods and operational truth", () => {
  it("compares a partial current quarter with exactly the equivalent prior-year dates", () => {
    expect(periodBounds(2026, "q4", now)).toMatchObject({
      start: "2026-10-01",
      end: "2026-10-09",
    });
    expect(comparisonBounds(2026, "q4", now)).toMatchObject({
      start: "2025-10-01",
      end: "2025-10-09",
    });
    expect(periodBounds(2026, "q4", now, false).end).toBe("2026-12-31");
  });
  it("clamps leap-day comparisons and includes the last day of a historic quarter", () => {
    expect(comparisonBounds(2024, "ytd", new Date(2024, 1, 29)).end).toBe(
      "2023-02-28",
    );
    expect(periodBounds(2025, "q1", now).end).toBe("2025-03-31");
  });
  it("reconciles awards including renewal links and unclassified revenue without including future dates", () => {
    const rows = [
      row("2026-01-01", 100),
      row("2026-10-09", 200, "initial_sale", { renewal_id: "r" }),
      row("2026-02-02", 50, "service"),
      row("2026-10-10", 999),
    ];
    expect(revenueTotals(rows, periodBounds(2026, "ytd", now))).toEqual({
      nb: 100,
      renewals: 200,
      other: 50,
      total: 350,
    });
    expect(revenueTotals(rows).total).toBe(1349);
  });
  it("fills observed calendar gaps and the quarterly chart reconciles with selected cards", () => {
    const rows = [
      row("2026-01-01", 100),
      row("2026-03-31", 200, "renewal"),
      row("2026-04-01", 300),
    ];
    const monthly = revenueSeries(rows, 2026, "q1", "month", now);
    expect(monthly.map((r) => r.total)).toEqual([100, 0, 200]);
    expect(revenueSeries(rows, 2026, "q1", "quarter", now)[0].total).toBe(300);
  });
  it("never resurrects Completed, outcome-closed or superseded renewals and uses calendar days", () => {
    const rows = [
      { id: "a", status: "Completed", renewal_date: "2026-08-28" },
      {
        id: "b",
        status: "Upcoming",
        closed_at: "2026-01-01",
        renewal_date: "2026-01-01",
      },
      {
        id: "c",
        status: "Upcoming",
        outcome: "lost",
        renewal_date: "2026-01-01",
      },
      {
        id: "d",
        status: "Upcoming",
        superseded_by_renewal_id: "e",
        renewal_date: "2026-01-01",
      },
      { id: "e", status: "Upcoming", renewal_date: "2026-10-09" },
      { id: "f", status: "Upcoming", renewal_date: "2026-10-08" },
    ];
    expect(dashboardRenewals(rows, now).map((r) => [r.id, r.days])).toEqual([
      ["f", -1],
      ["e", 0],
    ]);
  });
  it("uses only assessed active partners and identical risk thresholds", () => {
    const rows = partnerHealthRows(
      [
        { id: "a", status: "Archived" },
        { id: "b", status: "Active" },
        { id: "c", status: "Active" },
        { id: "d", status: "Active" },
      ],
      {
        a: { health_score: 0 },
        b: { health_score: 39 },
        c: { health_score: 40 },
      },
    );
    expect(rows.map((r) => r.partner.id)).toEqual(["b", "c", "d"]);
    expect(atRiskHealth(rows).map((r) => r.partner.id)).toEqual(["b"]);
  });
  it("keeps old open pipeline, separates undated deals and forecasts using expected close dates", () => {
    const deals = [
      {
        id: "old",
        status: "Open",
        stage: "Qualified",
        created_at: "2015-01-01",
        expected_value: 100,
        expected_close_date: null,
      },
      {
        id: "next",
        status: "Open",
        stage: "Proposal Sent",
        expected_value: 200,
        expected_close_date: "2026-12-01",
        probability: 50,
      },
      {
        id: "closed",
        status: "Won",
        stage: "Won",
        expected_value: 999,
        expected_close_date: "2026-10-02",
      },
    ];
    const result = pipelineForecast(
      deals,
      periodBounds(2026, "q4", now, false),
    );
    expect(result.total).toBe(300);
    expect(result.scheduledValue).toBe(200);
    expect(result.weighted).toBe(100);
    expect(result.missing.map((d) => d.id)).toEqual(["old"]);
  });
});
