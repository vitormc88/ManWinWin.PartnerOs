import { describe, it, expect } from "vitest";
import {
  summarizeRevenueHistory,
  revenueByCountry,
  revenueByPartner,
  revenueMonthly,
  wonDealValue,
  shareOfTotal,
  toAmount,
  revenueYear,
  LIFETIME_REVENUE_LABEL,
  REVENUE_YTD_LABEL,
  WON_DEAL_VALUE_LABEL,
  NEW_BUSINESS_WON_LABEL,
  type RevenueHistoryRow,
} from "@/lib/revenue-metrics";

// Mirrors the confirmed production dataset: 8 entries / 3 clients.
// HQ lifetime 79,920.50 · 2026 YTD 42,583.60
// FITC lifetime 37,301.50 · YTD 4,221.60 · 1 client
// Raven lifetime 42,619.00 · YTD 38,362.00 · 2 clients
const FITC = "11111111-1111-4111-8111-111111111111";
const RAVEN = "22222222-2222-4222-8222-222222222222";

const WATSONS = "c-watsons";
const APS = "c-aps";
const BARCINO = "c-barcino";

const PRODUCTION_ROWS: RevenueHistoryRow[] = [
  // FITC — Watsons: 33,079.90 historical + 4,221.60 billed in 2026 = 37,301.50
  { client_id: WATSONS, partner_uuid: FITC, partner_name: "FITC", country: "Philippines", amount: 33079.9, revenue_date: "2025-07-19" },
  { client_id: WATSONS, partner_uuid: FITC, partner_name: "FITC", country: "Philippines", amount: 4221.6, revenue_date: "2026-07-19" },
  // Raven — APS: 4,257.00 historical + 1,656.00 in 2026 = 5,913.00
  { client_id: APS, partner_uuid: RAVEN, partner_name: "Raven", country: "Portugal", amount: 2601.0, revenue_date: "2024-08-08" },
  { client_id: APS, partner_uuid: RAVEN, partner_name: "Raven", country: "Portugal", amount: 1000.0, revenue_date: "2025-02-08" },
  { client_id: APS, partner_uuid: RAVEN, partner_name: "Raven", country: "Portugal", amount: 656.0, revenue_date: "2025-08-08" },
  { client_id: APS, partner_uuid: RAVEN, partner_name: "Raven", country: "Portugal", amount: 1656.0, revenue_date: "2026-08-08" },
  // Raven — Transportes Barcino: 36,706.00, all billed in 2026
  { client_id: BARCINO, partner_uuid: RAVEN, partner_name: "Raven", country: "Spain", amount: 22675.0, revenue_date: "2026-04-14" },
  { client_id: BARCINO, partner_uuid: RAVEN, partner_name: "Raven", country: "Spain", amount: 14031.0, revenue_date: "2026-01-14" },
];


describe("revenue-metrics — historical revenue summary", () => {
  it("computes HQ lifetime, YTD, entry count and distinct clients", () => {
    const s = summarizeRevenueHistory(PRODUCTION_ROWS, 2026);
    expect(s.lifetime_revenue).toBe(79920.5);
    expect(s.revenue_ytd).toBe(42583.6);
    expect(s.revenue_entry_count).toBe(8);
    expect(s.clients_with_revenue).toBe(3);
  });

  it("scopes to FITC when RLS returns only FITC rows", () => {
    const s = summarizeRevenueHistory(PRODUCTION_ROWS.filter(r => r.partner_uuid === FITC), 2026);
    expect(s.lifetime_revenue).toBe(37301.5);
    expect(s.revenue_ytd).toBe(4221.6);
    expect(s.clients_with_revenue).toBe(1);
  });

  it("scopes to Raven when RLS returns only Raven rows", () => {
    const s = summarizeRevenueHistory(PRODUCTION_ROWS.filter(r => r.partner_uuid === RAVEN), 2026);
    expect(s.lifetime_revenue).toBe(42619);
    expect(s.revenue_ytd).toBe(38362);
    expect(s.clients_with_revenue).toBe(2);
  });

  it("partner slices sum back to the HQ total (no double counting)", () => {
    const hq = summarizeRevenueHistory(PRODUCTION_ROWS, 2026);
    const fitc = summarizeRevenueHistory(PRODUCTION_ROWS.filter(r => r.partner_uuid === FITC), 2026);
    const raven = summarizeRevenueHistory(PRODUCTION_ROWS.filter(r => r.partner_uuid === RAVEN), 2026);
    expect(fitc.lifetime_revenue + raven.lifetime_revenue).toBe(hq.lifetime_revenue);
    expect(fitc.revenue_ytd + raven.revenue_ytd).toBe(hq.revenue_ytd);
  });

  it("counts undated entries in lifetime but never in a calendar year", () => {
    const rows: RevenueHistoryRow[] = [{ client_id: "x", amount: 100, revenue_date: null }];
    const s = summarizeRevenueHistory(rows, 2026);
    expect(s.lifetime_revenue).toBe(100);
    expect(s.revenue_ytd).toBe(0);
  });

  it("returns zeroes for an empty/absent dataset instead of throwing", () => {
    expect(summarizeRevenueHistory([], 2026).lifetime_revenue).toBe(0);
    expect(summarizeRevenueHistory(undefined, 2026).clients_with_revenue).toBe(0);
  });

  it("coerces numeric strings coming back from Postgres", () => {
    expect(toAmount("4221.60")).toBe(4221.6);
    expect(toAmount(null)).toBe(0);
    expect(toAmount("not-a-number")).toBe(0);
    expect(revenueYear("2026-07-19")).toBe(2026);
    expect(revenueYear(null)).toBeNull();
  });
});

describe("revenue-metrics — grouping uses history, not deals", () => {
  it("groups revenue by country", () => {
    const g = revenueByCountry(PRODUCTION_ROWS);
    expect(g.map(x => x.label)).toEqual(["Spain", "Philippines", "Portugal"]);
    expect(g[0].revenue).toBe(37381);
    expect(g[1].revenue).toBe(37301.5);
    expect(g[2].revenue).toBe(5913);
    expect(g.reduce((s, x) => s + x.revenue, 0)).toBe(79920.5);
  });

  it("groups revenue by canonical partner", () => {
    const g = revenueByPartner(PRODUCTION_ROWS);
    expect(g.find(x => x.label === "Raven")?.revenue).toBe(42619);
    expect(g.find(x => x.label === "FITC")?.revenue).toBe(37301.5);
    expect(g.find(x => x.label === "FITC")?.client_count).toBe(1);
  });

  it("labels unlinked revenue as HQ Direct", () => {
    const g = revenueByPartner([{ client_id: "a", amount: 10, revenue_date: "2026-01-01" }]);
    expect(g[0].label).toBe("HQ Direct");
  });

  it("builds an ascending monthly series", () => {
    const pts = revenueMonthly(PRODUCTION_ROWS);
    expect(pts[0].month_key).toBe("2024-08");
    expect(pts.map(p => p.month_key)).toEqual([...pts.map(p => p.month_key)].sort());
    expect(pts.find(p => p.month_key === "2026-04")?.revenue).toBe(22675);
    expect(pts.reduce((s, p) => s + p.revenue, 0)).toBe(79920.5);
  });
});

describe("revenue-metrics — Won Deals stay separate from revenue", () => {
  it("reports zero Won deal value for imported customers with revenue", () => {
    const summary = summarizeRevenueHistory(PRODUCTION_ROWS, 2026);
    const won = wonDealValue([]); // production has 0 Won deals
    expect(summary.lifetime_revenue).toBe(79920.5);
    expect(won.value).toBe(0);
    expect(won.count).toBe(0);
  });

  it("ignores non-Won deals and never reads revenue history", () => {
    const won = wonDealValue([
      { status: "Won", value: 5000 },
      { status: "Open", value: 999999 },
      { status: "Lost", value: 4000 },
    ]);
    expect(won).toEqual({ value: 5000, count: 1 });
  });

  it("exposes distinct labels so revenue is never rendered as Total Revenue", () => {
    const labels = [LIFETIME_REVENUE_LABEL, REVENUE_YTD_LABEL, WON_DEAL_VALUE_LABEL, NEW_BUSINESS_WON_LABEL];
    expect(new Set(labels).size).toBe(4);
    expect(labels).not.toContain("Total Revenue");
  });

  it("shareOfTotal avoids dividing historical revenue by won-deal counts", () => {
    const total = summarizeRevenueHistory(PRODUCTION_ROWS, 2026).lifetime_revenue;
    const spain = revenueByCountry(PRODUCTION_ROWS).find(g => g.label === "Spain")!;
    expect(shareOfTotal(spain.revenue, total)).toBe(47);
    // zero won deals must not blow up or produce Infinity
    expect(shareOfTotal(total, 0)).toBe(0);
  });
});
