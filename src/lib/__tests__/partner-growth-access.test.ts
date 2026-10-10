import { describe, expect, it } from "vitest";
import { getRouteModule, hasModuleAccess, INTERNAL_ONLY_MODULES } from "@/lib/module-access";

describe("Partner Growth navigation permissions", () => {
  const permission = [{ module_key: "partner_growth", access_level: "edit" }];

  it("resolves both recruitment list and prospect details to the same module", () => {
    expect(getRouteModule("/partner-growth")?.moduleKey).toBe("partner_growth");
    expect(getRouteModule("/partner-growth/123")?.moduleKey).toBe("partner_growth");
  });

  it("never shows Partner Growth to an external partner user", () => {
    expect(INTERNAL_ONLY_MODULES.has("partner_growth")).toBe(true);
    expect(hasModuleAccess(permission, "partner_growth", { isPartnerUser: true })).toBe(false);
  });

  it("requires an explicit effective permission for non-admin internal users", () => {
    expect(hasModuleAccess([], "partner_growth", { isPartnerUser: false })).toBe(false);
    expect(hasModuleAccess([{ module_key: "partner_growth", access_level: "no_access" }], "partner_growth", { isPartnerUser: false })).toBe(false);
    expect(hasModuleAccess(permission, "partner_growth", { isPartnerUser: false })).toBe(true);
  });

  it("does not reuse the customer prospecting permission", () => {
    expect(hasModuleAccess([{ module_key: "prospecting", access_level: "admin" }], "partner_growth")).toBe(false);
  });
});
