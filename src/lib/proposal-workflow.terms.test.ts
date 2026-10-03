import { describe, it, expect } from "vitest";
import { commercialTermsChanged, decideProposalSave, type CommercialConfig } from "./proposal-workflow";

const base = (): CommercialConfig => ({
  proposal: { plan: 2, product_family: "Business", license_model: "keepit", total_year_1: 3000, total_recurring: 3000, payment_terms: "30 days", business_config: { a: 1, b: { c: 2 } } },
  items: [
    { item_code: "sw", item_name: "Software", category: "software", qty: 1, unit_price: 2000, total: 2000, net_total: 2000, is_recurring: true, frequency: "annual" },
    { item_code: "sat", item_name: "S&AT", category: "addon", qty: 1, unit_price: 1000, total: 1000, net_total: 1000, is_recurring: true, frequency: "annual" },
  ],
});
const withStatus = (s: string) => ({ ...base(), status: s });

describe("commercial terms comparison (grand total unchanged)", () => {
  it("unchanged config, reordered lines and reordered JSON keys are not a change", () => {
    const b = base();
    const n = base();
    n.items.reverse();
    n.proposal.business_config = { b: { c: 2 }, a: 1 };
    expect(commercialTermsChanged(b, n)).toBe(false);
  });
  it("qty doubled with price halved is a change", () => {
    const n = base(); n.items[0].qty = 2; n.items[0].unit_price = 1000;
    expect(commercialTermsChanged(base(), n)).toBe(true);
  });
  it("value moved between lines is a change", () => {
    const n = base();
    Object.assign(n.items[0], { unit_price: 2500, total: 2500, net_total: 2500 });
    Object.assign(n.items[1], { unit_price: 500, total: 500, net_total: 500 });
    expect(commercialTermsChanged(base(), n)).toBe(true);
  });
  it("different product with the same price is a change", () => {
    const n = base(); n.items[0].item_code = "sw2"; n.items[0].item_name = "Other";
    expect(commercialTermsChanged(base(), n)).toBe(true);
  });
  it("licence model / entitlements / payment terms changes are changes", () => {
    for (const patch of [{ license_model: "useit" }, { entitlements: { users: 5 } }, { payment_terms: "60 days" }]) {
      const n = base(); Object.assign(n.proposal, patch);
      expect(commercialTermsChanged(base(), n)).toBe(true);
    }
  });
  it("sub-cent rounding noise is not a change", () => {
    const n = base(); n.proposal.total_year_1 = 3000.001;
    expect(commercialTermsChanged(base(), n)).toBe(false);
  });
});

describe("save decision", () => {
  const changed = () => { const n = base(); n.items[0].qty = 2; n.items[0].unit_price = 1000; return n; };
  it("Ready/Sent unchanged keep status", () => {
    expect(decideProposalSave(withStatus("Ready"), base())).toEqual({ kind: "save", status: "Ready" });
    expect(decideProposalSave(withStatus("Sent"), base())).toEqual({ kind: "save", status: "Sent" });
  });
  it("Ready/Sent changed need explicit return to Draft", () => {
    expect(decideProposalSave(withStatus("Ready"), changed())).toEqual({ kind: "confirm_revalidation", from: "Ready" });
    expect(decideProposalSave(withStatus("Sent"), changed(), { confirmedRevalidation: true })).toEqual({ kind: "save", status: "Draft" });
  });
  it("Accepted/Won changed are blocked, unchanged allowed", () => {
    expect(decideProposalSave(withStatus("Accepted"), changed()).kind).toBe("blocked");
    expect(decideProposalSave(withStatus("Won"), changed()).kind).toBe("blocked");
    expect(decideProposalSave(withStatus("Won"), base())).toEqual({ kind: "save", status: "Won" });
  });
  it("Draft and new proposals save as Draft", () => {
    expect(decideProposalSave(withStatus("Draft"), changed())).toEqual({ kind: "save", status: "Draft" });
    expect(decideProposalSave(null, base())).toEqual({ kind: "save", status: "Draft" });
  });
});
