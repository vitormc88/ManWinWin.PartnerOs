import { describe, it, expect } from "vitest";
import {
  resolvePartnerIdentity,
  matchesPartnerFilter,
  buildPartnerCreatePayload,
  buildPartnerUpdatePayload,
  isUuid,
  HQ_DIRECT_LABEL,
  LEGACY_UNRESOLVED_LABEL,
} from "@/lib/partner-identity";

const FITC = "3f0b1d2e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const WATSONS_CLIENT_ID = "01fbe90e-d3ea-4635-96aa-8e04060b8182";

describe("partner identity — canonical resolution", () => {
  it("resolves the correct partner from the canonical uuid", () => {
    const id = resolvePartnerIdentity({ partner_uuid: FITC, partner_id: FITC }, { [FITC]: "FITC" });
    expect(id.state).toBe("resolved");
    expect(id.partnerId).toBe(FITC);
    expect(id.label).toBe("FITC");
    expect(id.needsAttention).toBe(false);
  });

  it("keeps a legacy-only reference visible as unresolved instead of joining", () => {
    const id = resolvePartnerIdentity({ partner_uuid: null, partner_id: "FITC-LEGACY-KEY" }, { [FITC]: "FITC" });
    expect(id.state).toBe("legacy_unresolved");
    expect(id.partnerId).toBeNull();
    expect(id.label).toBe(LEGACY_UNRESOLVED_LABEL);
    expect(id.legacyRef).toBe("FITC-LEGACY-KEY");
    expect(id.needsAttention).toBe(true);
  });

  it("does not treat a legacy uuid string as the canonical relation", () => {
    const id = resolvePartnerIdentity({ partner_uuid: null, partner_id: FITC }, { [FITC]: "FITC" });
    expect(id.state).toBe("legacy_unresolved");
    expect(id.partnerName).toBeNull();
  });

  it("flags divergent uuid vs legacy references instead of merging them", () => {
    const id = resolvePartnerIdentity({ partner_uuid: FITC, partner_id: OTHER }, { [FITC]: "FITC", [OTHER]: "Other" });
    expect(id.state).toBe("conflict");
    expect(id.partnerId).toBe(FITC);
    expect(id.legacyRef).toBe(OTHER);
    expect(id.needsAttention).toBe(true);
  });

  it("treats an empty record as HQ Direct", () => {
    expect(resolvePartnerIdentity({}).state).toBe("unlinked");
    expect(resolvePartnerIdentity({}).label).toBe(HQ_DIRECT_LABEL);
  });

  it("production-shaped Watsons/FITC fixture resolves without mutating data", () => {
    const row = Object.freeze({
      id: WATSONS_CLIENT_ID,
      commercial_name: "Watsons",
      partner_uuid: FITC,
      partner_id: FITC,
    });
    const id = resolvePartnerIdentity(row, { [FITC]: "FITC" });
    expect(id.state).toBe("resolved");
    expect(id.partnerName).toBe("FITC");
    expect(row.partner_id).toBe(FITC);
    expect(row.partner_uuid).toBe(FITC);
  });

  it("isUuid rejects non-uuid legacy keys", () => {
    expect(isUuid(FITC)).toBe(true);
    expect(isUuid("FITC")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe("partner identity — filtering", () => {
  const rows = [
    { partner_uuid: FITC, partner_id: null },
    { partner_uuid: null, partner_id: "OLD-KEY" },
    { partner_uuid: null, partner_id: null },
  ];
  it("hq filter excludes legacy-only rows", () => {
    expect(rows.filter((r) => matchesPartnerFilter(r, "hq"))).toHaveLength(1);
  });
  it("partner filter only matches canonical uuid", () => {
    expect(rows.filter((r) => matchesPartnerFilter(r, FITC))).toHaveLength(1);
  });
  it("legacy filter surfaces unresolved rows", () => {
    expect(rows.filter((r) => matchesPartnerFilter(r, "legacy"))).toHaveLength(1);
  });
});

describe("partner identity — write payloads", () => {
  it("new writes only use the canonical relation", () => {
    expect(buildPartnerCreatePayload(FITC)).toEqual({ partner_uuid: FITC });
    expect(Object.keys(buildPartnerCreatePayload(FITC))).not.toContain("partner_id");
  });

  it("non-uuid partner input never lands in the canonical column", () => {
    expect(buildPartnerCreatePayload("FITC")).toEqual({ partner_uuid: null });
  });

  it("saving another field without touching the partner preserves both raw values", () => {
    const current = { partner_uuid: null, partner_id: "OLD-KEY" };
    const payload = { commercial_name: "New name", ...buildPartnerUpdatePayload({ current, partnerChanged: false }) };
    expect(payload).toEqual({ commercial_name: "New name" });
    expect("partner_uuid" in payload).toBe(false);
    expect("partner_id" in payload).toBe(false);
  });

  it("explicit partner change writes only the canonical column", () => {
    const payload = buildPartnerUpdatePayload({
      current: { partner_uuid: null, partner_id: "OLD-KEY" },
      partnerChanged: true,
      nextPartnerId: FITC,
    });
    expect(payload).toEqual({ partner_uuid: FITC });
  });

  it("explicit unlink sets the canonical column to null and leaves legacy untouched", () => {
    const payload = buildPartnerUpdatePayload({
      current: { partner_uuid: FITC, partner_id: "OLD-KEY" },
      partnerChanged: true,
      nextPartnerId: null,
    });
    expect(payload).toEqual({ partner_uuid: null });
  });
});
