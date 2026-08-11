import { describe, it, expect } from "vitest";
import {
  normalizeProposalPayload,
  validateRenewalReadiness,
  resolveRenewalProjectName,
  defaultRenewalProjectName,
  totalsFromItems,
  GENERIC_PROJECT_NAME,
} from "@/lib/renewal-proposal-normalization";

const businessRenewalCtx = {
  usesContractBaselineItems: true,
  isBusinessProduct: true,
  baselinePlan: null,
  effectiveVariant: "useit" as const,
  variantNeedsReview: false,
  canonical: { renewal_id: "r1", client_id: "c1", partner_uuid: "p1" },
  clientName: "Petrobras Facilities Ltda",
};

const catalogueDefaults = {
  plan: 1,
  implementation_type: "Online",
  service_days: 3,
  business_config: { foo: 1 },
  project_name: GENERIC_PROJECT_NAME,
  license_model: "keepit",
  client_name: "Petrobras Facilities Ltda",
};

describe("renewal proposal normalization", () => {
  it("removes invented Plan 1 and implementation defaults from a Business renewal", () => {
    const out = normalizeProposalPayload(catalogueDefaults, businessRenewalCtx);
    expect(out.plan).toBeNull();
    expect(out.implementation_type).toBeNull();
    expect(out.service_days).toBeNull();
    expect(out.business_config).toBeNull();
  });

  it("never persists the generic catalogue project name", () => {
    const out = normalizeProposalPayload(catalogueDefaults, businessRenewalCtx);
    expect(out.project_name).toBe("Annual Contract Renewal — Petrobras Facilities Ltda");
    expect(defaultRenewalProjectName(null)).toBe("Annual Contract Renewal");
  });

  it("preserves a project name deliberately saved by the user", () => {
    const out = normalizeProposalPayload(
      { ...catalogueDefaults, project_name: "Renewal 2026 negotiated" },
      businessRenewalCtx,
    );
    expect(out.project_name).toBe("Renewal 2026 negotiated");
    expect(resolveRenewalProjectName({ savedProjectName: "Renewal 2026 negotiated", clientName: "X" })).toBe(
      "Renewal 2026 negotiated",
    );
  });

  it("persists only the proven or explicitly selected variant", () => {
    expect(normalizeProposalPayload(catalogueDefaults, businessRenewalCtx).license_model).toBe("useit");
    const unresolved = normalizeProposalPayload(catalogueDefaults, {
      ...businessRenewalCtx,
      effectiveVariant: null,
      variantNeedsReview: true,
    });
    expect(unresolved.license_model).toBeNull();
  });

  it("preserves canonical identifiers", () => {
    const out = normalizeProposalPayload(
      { ...catalogueDefaults, renewal_id: null } as Record<string, any>,
      businessRenewalCtx,
    );
    expect(out.renewal_id).toBe("r1");
    expect(out.client_id).toBe("c1");
    expect(out.partner_uuid).toBe("p1");
  });

  it("leaves catalogue/pipeline proposals untouched", () => {
    const out = normalizeProposalPayload(catalogueDefaults, {
      ...businessRenewalCtx,
      usesContractBaselineItems: false,
    });
    expect(out).toEqual(catalogueDefaults);
  });

  it("keeps a Professional plan proven by the source", () => {
    const out = normalizeProposalPayload(catalogueDefaults, {
      ...businessRenewalCtx,
      isBusinessProduct: false,
      baselinePlan: 2,
    });
    expect(out.plan).toBe(2);
    expect(out.license_model).toBeNull();
  });
});

describe("renewal readiness gate", () => {
  it("allows generation for a resolved Business renewal", () => {
    expect(validateRenewalReadiness(businessRenewalCtx, { itemCount: 4 }).ok).toBe(true);
  });

  it("blocks generation while the variant is unresolved but keeps Draft possible", () => {
    const r = validateRenewalReadiness(
      { ...businessRenewalCtx, effectiveVariant: null, variantNeedsReview: true },
      { itemCount: 4 },
    );
    expect(r.ok).toBe(false);
    expect(r.blockers[0]).toContain("Select KeepIT or UseIT");
  });

  it("blocks generation of a Professional renewal without a proven plan", () => {
    const r = validateRenewalReadiness(
      { ...businessRenewalCtx, isBusinessProduct: false, baselinePlan: null },
      { itemCount: 3 },
    );
    expect(r.ok).toBe(false);
    expect(r.blockers[0]).toContain("Professional plan is not recorded");
  });

  it("records the proposal-only variant selection as a warning", () => {
    const r = validateRenewalReadiness(
      { ...businessRenewalCtx, variantNeedsReview: true, effectiveVariant: "useit" },
      { itemCount: 4 },
    );
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toBe("Variant selected for proposal · source baseline not recorded");
  });

  it("never gates a pipeline proposal", () => {
    expect(validateRenewalReadiness({ ...businessRenewalCtx, usesContractBaselineItems: false }).ok).toBe(true);
  });
});

describe("totals derive from the real line items", () => {
  it("splits Year 1 and recurring", () => {
    const t = totalsFromItems([
      { total: 28000, is_recurring: true },
      { total: 4200, is_recurring: true },
      { total: 1800, is_recurring: true },
      { total: 5600, is_recurring: true },
      { total: 2000, is_recurring: false },
    ]);
    expect(t.totalYear1).toBe(41600);
    expect(t.totalRecurring).toBe(39600);
  });
});
