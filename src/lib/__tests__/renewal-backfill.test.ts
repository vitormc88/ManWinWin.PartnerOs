import { describe, it, expect } from "vitest";
import {
  planContractRenewals,
  hasEquivalentContractRenewal,
  buildContractRenewalInsert,
  activeClientCounts,
  countingPartnerId,
  IMPORTED_CONTRACT_RENEWAL_NOTE,
  type ContractRenewalSeed,
  type ExistingRenewalRef,
} from "@/lib/renewal-backfill";

const FITC = "11111111-1111-4111-8111-111111111111";
const RAVEN = "22222222-2222-4222-8222-222222222222";

// Expected production renewals after the migration.
const SEEDS: ContractRenewalSeed[] = [
  { client_id: "c-aps", contract_id: "ct-aps", renewal_date: "2026-08-08", estimated_value: 1656, partner_uuid: RAVEN },
  { client_id: "c-watsons", contract_id: "ct-watsons", renewal_date: "2027-07-19", estimated_value: 4221.6, partner_uuid: FITC },
  { client_id: "c-barcino", contract_id: "ct-barcino", renewal_date: "2028-04-14", estimated_value: 14031, partner_uuid: RAVEN },
];

describe("renewal-backfill — imported contract renewals", () => {
  it("creates exactly one renewal per imported client on a clean database", () => {
    const planned = planContractRenewals(SEEDS, []);
    expect(planned).toHaveLength(3);
    expect(planned.map(p => [p.renewal_date, p.estimated_value])).toEqual([
      ["2026-08-08", 1656],
      ["2027-07-19", 4221.6],
      ["2028-04-14", 14031],
    ]);
  });

  it("sets target_type/target_id/contract_id and the canonical partner", () => {
    const [aps] = planContractRenewals([SEEDS[0]], []);
    expect(aps.target_type).toBe("contract");
    expect(aps.target_id).toBe("ct-aps");
    expect(aps.contract_id).toBe("ct-aps");
    expect(aps.partner_uuid).toBe(RAVEN);
    expect(aps.status).toBe("Open");
    expect(aps.billing_frequency).toBe("Annual");
    expect(aps.notes).toBe(IMPORTED_CONTRACT_RENEWAL_NOTE);
  });

  it("documents that no revenue history entry is created", () => {
    expect(buildContractRenewalInsert(SEEDS[1]).notes).toContain("no historical revenue entry created");
  });

  it("is idempotent — a second run plans nothing", () => {
    const first = planContractRenewals(SEEDS, []);
    const existing: ExistingRenewalRef[] = first.map(r => ({
      client_id: r.client_id,
      target_type: r.target_type,
      target_id: r.target_id,
      contract_id: r.contract_id,
      renewal_date: r.renewal_date,
    }));
    expect(planContractRenewals(SEEDS, existing)).toHaveLength(0);
  });

  it("skips a client that already has an equivalent renewal by date only", () => {
    const existing: ExistingRenewalRef[] = [
      { client_id: "c-watsons", target_type: "contract", renewal_date: "2027-07-19" },
    ];
    const planned = planContractRenewals(SEEDS, existing);
    expect(planned.map(p => p.client_id)).toEqual(["c-aps", "c-barcino"]);
  });

  it("does not treat a licence renewal as an equivalent contract renewal", () => {
    const existing: ExistingRenewalRef[] = [
      { client_id: "c-aps", target_type: "license", target_id: "lic-1", renewal_date: "2026-08-08" },
    ];
    expect(hasEquivalentContractRenewal(existing, SEEDS[0])).toBe(false);
  });

  it("deduplicates repeated seeds inside a single batch", () => {
    expect(planContractRenewals([SEEDS[0], SEEDS[0]], [])).toHaveLength(1);
  });

  it("ignores incomplete seeds rather than inserting nulls", () => {
    const bad = [{ client_id: "c-x", contract_id: "", renewal_date: "2026-01-01", estimated_value: 10, partner_uuid: null }];
    expect(planContractRenewals(bad as ContractRenewalSeed[], [])).toHaveLength(0);
  });
});

describe("renewal-backfill — active client counts", () => {
  it("counts active clients through canonical partner_uuid", () => {
    const counts = activeClientCounts([
      { status: "Active", partner_uuid: FITC },
      { status: "Active", partner_uuid: FITC },
      { status: "Active", partner_uuid: RAVEN },
    ]);
    expect(counts[FITC]).toBe(2);
    expect(counts[RAVEN]).toBe(1);
  });

  it("falls back to legacy partner_id only when partner_uuid is null", () => {
    expect(countingPartnerId({ partner_uuid: null, partner_id: RAVEN })).toBe(RAVEN);
    expect(countingPartnerId({ partner_uuid: FITC, partner_id: RAVEN })).toBe(FITC);
  });

  it("ignores non-uuid legacy references and unlinked clients", () => {
    expect(countingPartnerId({ partner_id: "PT-RAV-001" })).toBeNull();
    expect(countingPartnerId({})).toBeNull();
    expect(activeClientCounts([{ status: "Active", partner_id: "legacy-code" }])).toEqual({});
  });

  it("excludes inactive clients from the cached count", () => {
    const counts = activeClientCounts([
      { status: "Active", partner_uuid: FITC },
      { status: "Inactive", partner_uuid: FITC },
    ]);
    expect(counts[FITC]).toBe(1);
  });
});
