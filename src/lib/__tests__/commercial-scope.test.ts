import { describe, it, expect } from "vitest";
import {
  canViewDeal, canManageDeal, canChangeScope, canCloseAsWon, dealScopeKey,
  type ScopeActor, type ScopeDeal,
} from "@/lib/commercial-scope";

const hq = (id: string, salesAccess: ScopeActor["salesAccess"], isActive = true): ScopeActor =>
  ({ id, isHq: true, isActive, partnerId: null, salesAccess });
const partner = (id: string, partnerId: string, salesAccess: ScopeActor["salesAccess"] = "no_access"): ScopeActor =>
  ({ id, isHq: false, isActive: true, partnerId, salesAccess });

const sellerA = hq("A", "edit");
const sellerB = hq("B", "edit");
const manager = hq("M", "admin");
const hqNoSales = hq("N", "no_access");
const hqInactive = hq("I", "admin", false);
const partnerA = partner("PA", "p-a", "admin"); // accidental Sales grant
const partnerB = partner("PB", "p-b");

const directA: ScopeDeal = { sales_engine: "new_business", partner_id: null, assigned_user_id: "A" };
const directB: ScopeDeal = { sales_engine: "new_business", partner_id: null, assigned_user_id: "B" };
const dealPA: ScopeDeal = { sales_engine: "partner", partner_id: "p-a", assigned_user_id: null };
const legacyPA: ScopeDeal = { sales_engine: null, partner_id: "p-a", assigned_user_id: null };

describe("Direct isolation", () => {
  it("seller sees and edits own Direct deal", () => {
    expect(canViewDeal(sellerA, directA)).toBe(true);
    expect(canManageDeal(sellerA, directA)).toBe(true);
  });
  it("seller cannot see or edit another seller's Direct deal", () => {
    expect(canViewDeal(sellerA, directB)).toBe(false);
    expect(canManageDeal(sellerA, directB)).toBe(false);
  });
  it("seller cannot change owner, engine or partner", () => {
    expect(canChangeScope(sellerA, directA, { ...directA, assigned_user_id: "B" })).toBe(false);
    expect(canChangeScope(sellerA, directA, { ...directA, sales_engine: "partner" })).toBe(false);
    expect(canChangeScope(sellerA, directA, { ...directA, sales_engine: "partner", partner_id: "p-a" })).toBe(false);
  });
  it("view-only seller cannot edit own Direct deal", () => {
    expect(canManageDeal(hq("A", "view"), directA)).toBe(false);
    expect(canViewDeal(hq("A", "view"), directA)).toBe(true);
  });
  it("manager sees portfolio and can reassign", () => {
    expect(canViewDeal(manager, directA) && canViewDeal(manager, directB)).toBe(true);
    expect(canChangeScope(manager, directA, { ...directA, assigned_user_id: "B" })).toBe(true);
  });
  it("HQ without Sales and inactive HQ have no Direct access", () => {
    expect(canViewDeal(hqNoSales, directA)).toBe(false);
    expect(canViewDeal(hqInactive, directA)).toBe(false);
  });
});

describe("Partner regression", () => {
  it("partner has zero Direct access even with a Sales grant", () => {
    expect(canViewDeal(partnerA, directA)).toBe(false);
    expect(canManageDeal(partnerA, directA)).toBe(false);
  });
  it("partner A cannot access partner B; own deals unchanged (classified and legacy)", () => {
    expect(canViewDeal(partnerB, dealPA)).toBe(false);
    expect(canManageDeal(partnerA, dealPA)).toBe(true);
    expect(canManageDeal(partnerA, legacyPA)).toBe(true);
  });
  it("partner cannot convert own deal into Direct", () => {
    expect(canChangeScope(partnerA, dealPA, { sales_engine: "new_business", partner_id: null, assigned_user_id: "PA" })).toBe(false);
  });
  it("HQ keeps existing access to non-Direct deals without Sales", () => {
    expect(canManageDeal(hqNoSales, dealPA)).toBe(true);
  });
});

describe("Direct closing interlock", () => {
  it("Direct cannot close as Won; Partner and legacy can", () => {
    expect(canCloseAsWon(directA)).toBe(false);
    expect(canCloseAsWon(dealPA)).toBe(true);
    expect(canCloseAsWon(legacyPA)).toBe(true);
  });
});

describe("cache isolation", () => {
  it("query keys differ by engine and owner", () => {
    expect(dealScopeKey({ sales_engine: "new_business", assigned_user_id: "A" }))
      .not.toEqual(dealScopeKey({ sales_engine: "partner" }));
  });
});
