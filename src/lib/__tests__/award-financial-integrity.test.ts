import { describe, it, expect } from "vitest";
import { businessAwardIntegrityBlocker } from "../award-financial-integrity";

const proposal = { product_family: "Business", proposal_mode: "keepit_only",
  total_year_1: 683864.20, total_recurring: 393018.20 };
const items = [
  { id: "software", net_total: 231196, gross_total: 251300, discount_amount: 20104, is_recurring: false },
  { id: "web", net_total: 348967.2, gross_total: 359760, discount_amount: 10792.8,
    is_recurring: true, apply_discount_to_renewal: true },
  { id: "api", net_total: 600, gross_total: 600, discount_amount: 0, is_recurring: true },
  { id: "sat", net_total: 43451, gross_total: 43451, discount_amount: 0, is_recurring: true },
  { id: "services", net_total: 59650, gross_total: 59650, discount_amount: 0, is_recurring: false },
];
const lines = items.map(i=>({ source_item_id:i.id, amount:i.net_total }));

describe("FIN02 Business award source-item integrity", () => {
  it("accepts reconciled net rows, recurring Web discount and gross-base S&TA", () => {
    expect(businessAwardIntegrityBlocker(proposal, items, lines)).toBeNull();
  });
  it("rejects contract edits that keep the same grand total while changing two items", () => {
    const edited = lines.map(l => ({...l}));
    edited[0].amount += 100;
    edited[1].amount -= 100;
    expect(businessAwardIntegrityBlocker(proposal, items, edited)).toBe("FIN02_CONTRACT_LINE_VALUE_MISMATCH");
  });
  it("rejects missing or duplicate source row mapping", () => {
    expect(businessAwardIntegrityBlocker(proposal, items, lines.slice(1))).toBe("FIN02_CONTRACT_LINE_COUNT_MISMATCH");
    expect(businessAwardIntegrityBlocker(proposal, items, [...lines.slice(0,4),lines[0]])).toBe("FIN02_CONTRACT_LINE_SOURCE_MISMATCH");
  });
  it("rejects original R1 gross proposal lines even if header claims net price", () => {
    const broken = items.map(i=>({...i,discount_amount:0, net_total:i.gross_total}));
    expect(businessAwardIntegrityBlocker(proposal, broken, lines)).toBe("FIN02_PROPOSAL_HEADER_LINE_MISMATCH");
  });
  it("fails closed on a Year-1-only Web discount until future contract price is expressible", () => {
    const unrenewed = items.map(i=>i.id==="web"?{...i,apply_discount_to_renewal:false}:i);
    const adjusted={...proposal,total_recurring:403811};
    expect(businessAwardIntegrityBlocker(adjusted, unrenewed, lines))
      .toBe("FIN02_TEMPORARY_RECURRING_DISCOUNT_NEEDS_CONTRACT_POLICY");
  });
  it("requires explicit award snapshot when comparing KeepIT against UseIT", () => {
    expect(businessAwardIntegrityBlocker({...proposal,proposal_mode:"compare_keepit_useit"},items,lines))
      .toBe("FIN02_COMPARE_REQUIRES_AWARDED_OPTION_SNAPSHOT");
  });
  it("does not change unrelated Professional award behavior", () => {
    expect(businessAwardIntegrityBlocker({...proposal,product_family:"Professional"},[],[])).toBeNull();
  });
});
