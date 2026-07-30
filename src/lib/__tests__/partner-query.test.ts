import { describe, it, expect, vi } from "vitest";
import {
  canonicalPartnerScope,
  applyPartnerScope,
  belongsToPartner,
  CANONICAL_PARTNER_COLUMN,
} from "../partner-query";

const PARTNER = "db1b15b7-1111-4111-8111-111111111111";
const OTHER = "aa11bb22-2222-4222-8222-222222222222";

function fakeQuery() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const q: any = {
    calls,
    eq: vi.fn((...args: unknown[]) => {
      calls.push({ op: "eq", args });
      return q;
    }),
    is: vi.fn((...args: unknown[]) => {
      calls.push({ op: "is", args });
      return q;
    }),
  };
  return q;
}

describe("canonical partner read scope", () => {
  it("scopes a uuid reference to partner_uuid, never partner_id", () => {
    const q = fakeQuery();
    const scoped = applyPartnerScope(q, canonicalPartnerScope(PARTNER));
    expect(scoped).toBe(q);
    expect(q.calls).toEqual([{ op: "eq", args: [CANONICAL_PARTNER_COLUMN, PARTNER] }]);
    expect(q.calls.some((c: any) => c.args[0] === "partner_id")).toBe(false);
  });

  it("scopes an explicit null to HQ Direct via partner_uuid is null", () => {
    const q = fakeQuery();
    applyPartnerScope(q, canonicalPartnerScope(null));
    expect(q.calls).toEqual([{ op: "is", args: [CANONICAL_PARTNER_COLUMN, null] }]);
  });

  it("refuses to build a query for a legacy/non-uuid reference", () => {
    const q = fakeQuery();
    const scope = canonicalPartnerScope("FITC-LEGACY-CODE");
    expect(scope.kind).toBe("unresolved");
    expect(applyPartnerScope(q, scope)).toBeNull();
    expect(q.calls).toHaveLength(0);
  });
});

describe("belongsToPartner (in-memory renewals/clients filtering)", () => {
  it("matches a canonical-only record", () => {
    expect(belongsToPartner({ partner_uuid: PARTNER, partner_id: null }, PARTNER)).toBe(true);
  });

  it("does not auto-associate a legacy-only record", () => {
    expect(belongsToPartner({ partner_uuid: null, partner_id: PARTNER }, PARTNER)).toBe(false);
    expect(belongsToPartner({ partner_uuid: null, partner_id: "FITC" }, PARTNER)).toBe(false);
  });

  it("never matches another partner or HQ Direct rows", () => {
    expect(belongsToPartner({ partner_uuid: OTHER }, PARTNER)).toBe(false);
    expect(belongsToPartner({ partner_uuid: null, partner_id: null }, PARTNER)).toBe(false);
    expect(belongsToPartner({ partner_uuid: PARTNER }, "not-a-uuid")).toBe(false);
  });
});
