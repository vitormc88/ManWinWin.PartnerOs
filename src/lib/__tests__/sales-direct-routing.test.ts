import { describe, expect, it } from "vitest";
import { getRouteModule, hasModuleAccess } from "@/lib/module-access";
import { canCloseAsWon, canViewDeal, type ScopeActor } from "@/lib/commercial-scope";

describe("Sales Sprint 1 routing and rules", () => {
  it("routes /sales/pipeline and /sales/deals/:id to the internal 'sales' module", () => {
    expect(getRouteModule("/sales/pipeline")?.moduleKey).toBe("sales");
    expect(getRouteModule("/sales/deals/abc")?.moduleKey).toBe("sales");
  });

  it("a partner user never gets the sales module, even if granted", () => {
    expect(hasModuleAccess([{ module_key: "sales", access_level: "admin" }], "sales", { isPartnerUser: true })).toBe(false);
  });

  it("Direct deals cannot be closed as Won; partner deals still can", () => {
    expect(canCloseAsWon({ sales_engine: "new_business" })).toBe(false);
    expect(canCloseAsWon({ sales_engine: null })).toBe(true);
    expect(canCloseAsWon({ sales_engine: "partner" })).toBe(true);
  });

  it("seller A cannot view seller B's Direct deal", () => {
    const a: ScopeActor = { id: "A", isHq: true, isActive: true, partnerId: null, salesAccess: "edit" };
    expect(canViewDeal(a, { sales_engine: "new_business", partner_id: null, assigned_user_id: "B" })).toBe(false);
    expect(canViewDeal(a, { sales_engine: "new_business", partner_id: null, assigned_user_id: "A" })).toBe(true);
  });
});
