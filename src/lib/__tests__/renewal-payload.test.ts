import { describe, it, expect } from "vitest";
import { buildRenewalPartnerPayload, buildRenewalInsertPayload } from "@/lib/renewal-payload";

const PARTNER = "3f0b1d2e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

describe("renewal partner payload — canonical writes only", () => {
  it("client with canonical uuid + legacy text writes only partner_uuid", () => {
    const client = { partner_uuid: PARTNER, partner_id: "OLD-LEGACY-KEY" };
    const payload = buildRenewalPartnerPayload(client);
    expect(payload).toEqual({ partner_uuid: PARTNER });
    expect("partner_id" in payload).toBe(false);
  });

  it("legacy-only client never promotes the legacy text reference", () => {
    const payload = buildRenewalPartnerPayload({ partner_uuid: null, partner_id: PARTNER });
    expect(payload).toEqual({ partner_uuid: null });
  });

  it("HQ Direct client yields a null canonical relation", () => {
    expect(buildRenewalPartnerPayload({})).toEqual({ partner_uuid: null });
    expect(buildRenewalPartnerPayload(null)).toEqual({ partner_uuid: null });
  });
});

describe("renewal insert payload", () => {
  const base = {
    client_id: "c-1",
    contract_id: "ct-1",
    target_type: "contract",
    target_id: "ct-1",
    renewal_type: "Contract",
    renewal_date: "2027-01-31",
    estimated_value: 12000,
    billing_frequency: "Annual",
    status: "Upcoming",
    notes: "Annual Contract Renewal",
  };

  it("keeps every other renewal field intact", () => {
    const payload = buildRenewalInsertPayload(base, { partner_uuid: PARTNER, partner_id: "OLD" });
    expect(payload).toEqual({ ...base, partner_uuid: PARTNER });
  });

  it("drops any legacy partner_id supplied by the caller", () => {
    const payload = buildRenewalInsertPayload(
      { ...base, partner_id: "OLD-LEGACY-KEY" } as Record<string, unknown>,
      { partner_uuid: PARTNER },
    );
    expect("partner_id" in payload).toBe(false);
    expect(payload.partner_uuid).toBe(PARTNER);
  });

  it("legacy-only source produces partner_uuid null without promoting legacy text", () => {
    const payload = buildRenewalInsertPayload(base, { partner_uuid: null, partner_id: PARTNER });
    expect(payload.partner_uuid).toBeNull();
    expect("partner_id" in payload).toBe(false);
    expect(payload.renewal_date).toBe("2027-01-31");
    expect(payload.estimated_value).toBe(12000);
  });

  it("does not mutate the caller's field object", () => {
    const fields = { ...base, partner_id: "OLD" };
    buildRenewalInsertPayload(fields, { partner_uuid: PARTNER });
    expect(fields.partner_id).toBe("OLD");
  });
});
