import { describe, it, expect } from "vitest";
import {
  getDiscountLimits,
  clampDiscountPct,
  effectiveDiscountPct,
  validateProfessionalLineDiscount,
  validateProfessionalItems,
  validateBusinessDiscounts,
  CONSERVATIVE_LIMITS,
} from "@/lib/proposal-discount-policy";

describe("proposal discount policy — limits", () => {
  it("HQ can discount up to 100% on software and services", () => {
    expect(getDiscountLimits({ isHQ: true, partnershipLevel: null })).toEqual({
      software: 100,
      services: 100,
    });
  });

  it("Reseller partner is capped at 10% software and 10% services", () => {
    expect(getDiscountLimits({ isHQ: false, partnershipLevel: "Reseller" })).toEqual({
      software: 10,
      services: 10,
    });
  });

  it("Implementer partner keeps 10% software but 100% services", () => {
    expect(getDiscountLimits({ isHQ: false, partnershipLevel: "Implementer" })).toEqual({
      software: 10,
      services: 100,
    });
  });

  it("Strategic Connector and Technologic are capped at 10% services", () => {
    for (const level of ["Strategic Connector", "Technologic"]) {
      expect(getDiscountLimits({ isHQ: false, partnershipLevel: level })).toEqual({
        software: 10,
        services: 10,
      });
    }
  });

  it("unknown/missing partnership level falls back to 10/10", () => {
    expect(getDiscountLimits({ isHQ: false, partnershipLevel: null })).toEqual({
      software: 10,
      services: 10,
    });
    expect(getDiscountLimits(null)).toEqual(CONSERVATIVE_LIMITS);
  });
});

describe("proposal discount policy — clamping and effective percentage", () => {
  it("clamps to the maximum and rejects negatives", () => {
    expect(clampDiscountPct(45, 10)).toBe(10);
    expect(clampDiscountPct(-5, 10)).toBe(0);
    expect(clampDiscountPct(7, 10)).toBe(7);
  });

  it("computes the effective percentage of a fixed EUR discount", () => {
    expect(effectiveDiscountPct("fixed", 100, 1000)).toBe(10);
    expect(effectiveDiscountPct("fixed", 300, 1000)).toBe(30);
    expect(effectiveDiscountPct("fixed", 100, 0)).toBeNull();
    expect(effectiveDiscountPct("none", 100, 1000)).toBe(0);
  });
});

describe("proposal discount policy — Professional line validation", () => {
  const partner = getDiscountLimits({ isHQ: false, partnershipLevel: "Reseller" });
  const implementer = getDiscountLimits({ isHQ: false, partnershipLevel: "Implementer" });
  const hq = getDiscountLimits({ isHQ: true });

  it("blocks a partner software line above 10%", () => {
    const res = validateProfessionalLineDiscount(
      { item_name: "Plan", category: "software", discount_type: "percent", discount_value: 15, gross_total: 1000 },
      partner,
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/10%/);
  });

  it("blocks a fixed EUR discount that exceeds 10% of gross", () => {
    const res = validateProfessionalLineDiscount(
      { item_name: "Plan", category: "software", discount_type: "fixed", discount_value: 200, gross_total: 1000 },
      partner,
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/20\.00%/);
  });

  it("allows a fixed EUR discount within 10% of gross", () => {
    expect(
      validateProfessionalLineDiscount(
        { category: "software", discount_type: "fixed", discount_value: 100, gross_total: 1000 },
        partner,
      ).ok,
    ).toBe(true);
  });

  it("allows an Implementer 100% service discount but not 100% software", () => {
    expect(
      validateProfessionalLineDiscount(
        { category: "service", discount_type: "percent", discount_value: 100, gross_total: 500 },
        implementer,
      ).ok,
    ).toBe(true);
    expect(
      validateProfessionalLineDiscount(
        { category: "software", discount_type: "percent", discount_value: 100, gross_total: 500 },
        implementer,
      ).ok,
    ).toBe(false);
  });

  it("allows HQ up to 100% on both", () => {
    expect(
      validateProfessionalItems(
        [
          { category: "software", discount_type: "percent", discount_value: 100, gross_total: 500 },
          { category: "service", discount_type: "fixed", discount_value: 500, gross_total: 500 },
        ],
        hq,
      ).ok,
    ).toBe(true);
  });

  it("returns the first violation across items", () => {
    const res = validateProfessionalItems(
      [
        { item_name: "OK", category: "software", discount_type: "percent", discount_value: 5, gross_total: 100 },
        { item_name: "Bad", category: "service", discount_type: "percent", discount_value: 50, gross_total: 100 },
      ],
      partner,
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/^Bad:/);
  });
});

describe("proposal discount policy — Business channel validation", () => {
  const partner = getDiscountLimits({ isHQ: false, partnershipLevel: "Technologic" });
  const implementer = getDiscountLimits({ isHQ: false, partnershipLevel: "Implementer" });

  it("blocks software channels above 10% for partners", () => {
    expect(validateBusinessDiscounts({ softwarePct: 20, webUsersPct: 0, apiPct: 0, servicesPct: 0 }, partner).ok).toBe(false);
    expect(validateBusinessDiscounts({ softwarePct: 0, webUsersPct: 15, apiPct: 0, servicesPct: 0 }, partner).ok).toBe(false);
    expect(validateBusinessDiscounts({ softwarePct: 0, webUsersPct: 0, apiPct: 11, servicesPct: 0 }, partner).ok).toBe(false);
  });

  it("blocks services above 10% for non-implementers and allows 100% for implementers", () => {
    expect(validateBusinessDiscounts({ servicesPct: 40 }, partner).ok).toBe(false);
    expect(validateBusinessDiscounts({ servicesPct: 100 }, implementer).ok).toBe(true);
    expect(validateBusinessDiscounts({ softwarePct: 100 }, implementer).ok).toBe(false);
  });

  it("accepts compliant values", () => {
    expect(validateBusinessDiscounts({ softwarePct: 10, webUsersPct: 5, apiPct: 0, servicesPct: 10 }, partner).ok).toBe(true);
  });
});
