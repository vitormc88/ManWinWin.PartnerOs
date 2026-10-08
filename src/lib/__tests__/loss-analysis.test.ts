import { describe, it, expect } from "vitest";
import { buildOpportunityRows, buildRenewalRows, applyLossFilters, categoryDistribution, reasonDistribution, lossSummary, NO_PARTNER, dayStart, dayEnd, fetchAllPages } from "@/lib/loss-analysis";

const deals = [
  { id: "d1", status: "Lost", company_name: "A", total_value: 0, expected_value: 1000, partner_id: "p1", assigned_user_id: "u1", assigned_salesperson: "Vitor", lost_at: "2026-03-01T10:00:00Z" },
  { id: "d2", status: "Lost", company_name: "B", total_value: 500, expected_value: 9, partner_id: null, assigned_user_id: "u2", assigned_salesperson: "Vitor", lost_at: null },
  { id: "d3", status: "Won", company_name: "C", total_value: 100 },
];
const details = [{ id: "x1", deal_id: "d1", loss_category: "Price", lost_at: "2026-03-02T10:00:00Z" }];
const reasons = [
  { loss_detail_id: "x1", reason: "Price too high" },
  { loss_detail_id: "x1", reason: "Price too high" },
  { loss_detail_id: "x1", reason: "No urgency" },
];

describe("loss analysis", () => {
  const opp = buildOpportunityRows(deals, details, reasons);
  it("one row per lost deal, authoritative value fallback, detail lost_at precedence", () => {
    expect(opp.map((r) => r.id)).toEqual(["d1", "d2"]);
    expect(opp[0].value).toBe(1000);
    expect(opp[0].lostAt).toBe("2026-03-02T10:00:00Z");
  });
  it("dedupes reasons within a deal and does not fan out values", () => {
    expect(opp[0].reasons).toEqual(["Price too high", "No urgency"]);
    expect(reasonDistribution(opp)).toEqual([{ label: "Price too high", count: 1 }, { label: "No urgency", count: 1 }]);
    expect(lossSummary(opp).value).toBe(1500);
  });
  it("missing category and reasons are explicit", () => {
    const s = lossSummary(opp);
    expect(s.missingCategory).toBe(1);
    expect(s.missingReasons).toBe(1);
    expect(categoryDistribution(opp).map((d) => d.label)).toContain("Not recorded");
  });
  it("renewals: estimated value not final 0, status/outcome dedup, historical closed cycle", () => {
    const rows = buildRenewalRows([
      { id: "r1", status: "Lost", outcome: "lost", estimated_value: 2616, final_value: 0, closed_at: "2024-01-01T00:00:00Z", loss_reason: "Other", client_id: "c1" },
      { id: "r1", status: "Lost", outcome: "lost", estimated_value: 2616 },
      { id: "r2", status: "Completed", outcome: null, estimated_value: 9 },
    ], new Map([["c1", "Client 1"]]));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(2616);
    expect(rows[0].name).toBe("Client 1");
  });
  it("date bounds inclusive; undated excluded only in bounded periods", () => {
    const all = applyLossFilters(opp, {});
    expect(all.rows).toHaveLength(2);
    const b = applyLossFilters(opp, { from: dayStart(new Date("2026-03-02T12:00:00Z")), to: dayEnd(new Date("2026-03-02T12:00:00Z")) });
    expect(b.rows.map((r) => r.id)).toEqual(["d1"]);
    expect(b.undatedExcluded).toBe(1);
  });
  it("owner by user ID never merges same name; partner HQ Direct filter", () => {
    expect(applyLossFilters(opp, { ownerKey: "u:u1" }).rows.map((r) => r.id)).toEqual(["d1"]);
    expect(applyLossFilters(opp, { partnerId: NO_PARTNER }).rows.map((r) => r.id)).toEqual(["d2"]);
  });
  it("pagination does not truncate at 1000", async () => {
    const data = Array.from({ length: 2500 }, (_, i) => i);
    const res = await fetchAllPages<number>(async (f, t) => ({ data: data.slice(f, t + 1), error: null }));
    expect(res).toHaveLength(2500);
  });
});

 it("reconciled duplicate losses excluded, genuine later cycles retained", () => {
 const rows=buildRenewalRows([
 {id:"original",client_id:"c",status:"Lost",estimated_value:2616},
 {id:"duplicate",client_id:"c",status:"Lost",estimated_value:1896,superseded_by_renewal_id:"original"},
 {id:"later-cycle",client_id:"c",status:"Lost",estimated_value:3000}
 ],new Map([["c","ASEE"]]));
 expect(rows.map(r=>r.id)).toEqual(["original","later-cycle"]);
 expect(lossSummary(rows)).toMatchObject({count:2,value:5616});
 });
