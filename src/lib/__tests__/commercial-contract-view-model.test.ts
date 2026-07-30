import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCommercialGroups,
  effectiveLineCategory,
  resolveContractRenewal,
} from "../commercial-contract-view-model";
import { UNCLASSIFIED_LINE_TYPE } from "../contract-lines";

const watsons = [
  { id: "1", line_type: "recurring", description: "S&AT", amount: 2301.6, currency: "EUR", billing_frequency: "annual" },
  { id: "2", line_type: "recurring", description: "SaaS Hosting", amount: 1200, currency: "EUR", billing_frequency: "annual" },
  { id: "3", line_type: "recurring", description: "ManWinWin Web — 10 accesses", amount: 720, currency: "EUR", billing_frequency: "annual" },
];

describe("commercial groups", () => {
  it("never uses an empty string as the effective category", () => {
    expect(effectiveLineCategory({ line_type: "totally-unknown", description: "Mystery item" }))
      .toBe(UNCLASSIFIED_LINE_TYPE);
    expect(effectiveLineCategory({ line_type: "sat", description: "S&AT" })).toBe("sat");
  });

  it("keeps an unknown line visible in a dedicated needs-review group", () => {
    const groups = buildCommercialGroups([
      ...watsons,
      { id: "9", line_type: "Manutencao Anual", description: "Legacy maintenance", amount: 350, currency: "EUR", billing_frequency: "annual" },
    ]);
    const review = groups.find((g) => g.key === "needs_review");
    expect(review).toBeTruthy();
    expect(review!.items.map((i: any) => i.id)).toEqual(["9"]);
    expect(review!.subtotal).toBe(350);
    expect(review!.label.toLowerCase()).toContain("needs review");
  });

  it("does not lose any line when grouping", () => {
    const lines = [
      ...watsons,
      { id: "9", line_type: "weird", description: "Legacy maintenance", amount: 350 },
      { id: "10", line_type: "", description: "No type at all", amount: 0 },
    ];
    const grouped = buildCommercialGroups(lines).flatMap((g) => g.items.map((i: any) => i.id));
    expect(grouped.sort()).toEqual(lines.map((l) => l.id).sort());
  });

  it("classifies the Watsons lines outside the needs-review group", () => {
    const groups = buildCommercialGroups(watsons);
    expect(groups.some((g) => g.key === "needs_review")).toBe(false);
    expect(groups.map((g) => g.key).sort()).toEqual(["hosting", "support"]);
  });
});

describe("renewal resolution in the contract view path", () => {
  const today = new Date("2026-08-01T00:00:00Z");

  it("falls back to the license end date when there is no renewal row and no contract end", () => {
    const r = resolveContractRenewal({
      renewal: null,
      contract: { contract_end_date: null },
      license: { license_end_date: "2027-03-31" },
      today,
    });
    expect(r.source).toBe("license_end");
    expect(r.date).toBe("2027-03-31");
  });

  it("prefers the contract end date over the license end date", () => {
    const r = resolveContractRenewal({
      renewal: null,
      contract: { contract_end_date: "2027-07-19" },
      license: { license_end_date: "2027-03-31" },
      today,
    });
    expect(r.source).toBe("contract_end");
    expect(r.date).toBe("2027-07-19");
  });

  it("prefers an open renewal row over everything else", () => {
    const r = resolveContractRenewal({
      renewal: { id: "r1", renewal_date: "2026-12-01", status: "Upcoming" },
      contract: { contract_end_date: "2027-07-19" },
      license: { license_end_date: "2027-03-31" },
      today,
    });
    expect(r.source).toBe("renewal_record");
    expect(r.date).toBe("2026-12-01");
  });

  it("ignores invalid dates so they never win precedence", () => {
    const r = resolveContractRenewal({
      renewal: { id: "r1", renewal_date: "not-a-date", status: "Upcoming" },
      contract: { contract_end_date: "0000-00-00" },
      license: { license_end_date: "2027-03-31" },
      today,
    });
    expect(r.source).toBe("license_end");
    expect(r.date).toBe("2027-03-31");
  });

  it("returns unknown when nothing valid exists", () => {
    const r = resolveContractRenewal({ renewal: null, contract: {}, license: null, today });
    expect(r.source).toBe("unknown");
    expect(r.date).toBeNull();
  });
});

/**
 * The duplicate guard must live in the real write paths, not only in the helper
 * module. These checks fail if someone removes the integration.
 */
describe("duplicate renewal guard is wired into the real write paths", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("is used by the partner renewal creation and materialization flow", () => {
    const src = read("src/pages/PartnerDetail.tsx");
    expect(src).toContain("shouldCreateRenewalWorkflowRow");
    expect(src.match(/shouldCreateRenewalWorkflowRow\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("is used by the manual contract renewal creation flow", () => {
    const src = read("src/pages/ClientDetail.tsx");
    expect(src).toContain("shouldCreateRenewalWorkflowRow");
    expect(src).toContain("canCreateRenewal");
  });

  it("keeps the contract-line form bound to the shared canonical vocabulary", () => {
    const src = read("src/components/clients/ContractLineDialog.tsx");
    expect(src).toContain("LINE_TYPE_OPTIONS");
    expect(src).not.toMatch(/"recurring"/);
  });
});
