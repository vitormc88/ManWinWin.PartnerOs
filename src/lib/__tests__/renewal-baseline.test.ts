import { describe, it, expect } from "vitest";
import {
  buildRenewalBaseline,
  buildBaselineProposalItems,
  buildRenewalFinancialSummary,
  compareProposalToBaseline,
  normalizeLicensedItems,
  canonicalModuleName,
  isBaseIncludedModule,
  isIgnoredModuleName,
} from "@/lib/renewal-baseline";

/** Real Petrobras shape (test environment). */
const renewal = {
  id: "33000000-0000-4000-a000-000000000002",
  client_id: "c1000000-0000-0000-0000-000000000005",
  contract_id: "22000000-0000-4000-a000-000000000004",
  license_id: "11000000-0000-4000-a000-000000000004",
  renewal_date: "2026-04-20",
  estimated_value: 39600,
};
const client = {
  id: renewal.client_id,
  commercial_name: "Petrobras Facilities Ltda",
  current_version: "8.2",
  cloud_onpremise: "Cloud",
  product_type: "ManWinWin Business",
  license_type: "Business",
};
const contract = {
  id: renewal.contract_id,
  currency: "EUR",
  contract_start_date: "2023-04-20",
  contract_end_date: "2026-04-20",
  total_value: 39600,
  hosting_value: 4200,
};
const contractLines = [
  { id: "l1", line_type: "license", description: "Core license", amount: 28000, currency: "EUR" },
  { id: "l2", line_type: "hosting", description: "Hosting", amount: 4200, currency: "EUR" },
  { id: "l3", line_type: "mww_web", description: "ManWinWin Web", amount: 1800, currency: "EUR" },
  { id: "l4", line_type: "sat", description: "S&AT", amount: 5600, currency: "EUR" },
];
const license = {
  id: renewal.license_id,
  product: "ManWinWin Business",
  license_model: "UseIT",
  deployment_type: "PostgreSQL", // legacy: a DB engine, never a deployment
  database_type: "PostgreSQL",
  version: "8.2",
  backoffice_users: 25,
  backoffice_employee_users: 8,
  web_accesses: 40,
  mobile_users: 20,
  periodicity: "Annual",
  currency: "EUR",
};

const build = (over: Record<string, any> = {}) =>
  buildRenewalBaseline({ renewal, client, contract, contractLines, license, licensedModules: [], ...over });

describe("renewal baseline — real contract evidence", () => {
  it("derives product, hosting, users and recurring value from the linked records", () => {
    const b = build();
    expect(b.hasRealData).toBe(true);
    expect(b.product).toBe("Business UseIT");
    expect(b.productFamily).toBe("Business");
    expect(b.hosting).toBe("SaaS"); // Cloud → hosted on ManWinWin servers
    expect(b.backofficeUsers).toBe(25);
    expect(b.webUsers).toBe(40);
    expect(b.currentRecurring).toBe(39600);
    expect(b.contractStartDate).toBe("2023-04-20");
    expect(b.renewalDate).toBe("2026-04-20");
    expect(b.billingFrequency).toBe("Annual");
  });

  it("never uses the unreliable LIC license version, only the reliable current version", () => {
    const b = build({ license: { ...license, version: "LIC-9999" } });
    expect(b.version).toBe("8.2");
  });

  it("marks genuinely missing fields instead of inventing defaults", () => {
    const b = build({ client: { ...client, current_version: null }, license: { ...license, backoffice_users: null } });
    expect(b.version).toBeNull();
    expect(b.backofficeUsers).toBeNull();
    expect(b.unmappedFields).toContain("version");
    expect(b.unmappedFields).toContain("backoffice_users");
  });

  it("falls back to the renewal value when no contract lines exist", () => {
    const b = build({ contractLines: [] });
    expect(b.currentRecurring).toBe(39600);
    expect(b.recurringLines).toHaveLength(0);
  });
});

describe("module vocabulary rules", () => {
  it("ignores employee accesses", () => {
    expect(isIgnoredModuleName("Employee Accesses")).toBe(true);
    expect(normalizeLicensedItems([{ module_name: "Employee Accesses" }]).modules).toHaveLength(0);
  });

  it("treats Costs / Budget Control as part of the Base module", () => {
    expect(isBaseIncludedModule("Budget Control")).toBe(true);
    const { modules } = normalizeLicensedItems([
      { module_name: "Budget Control", unit_price: 500, module_id: "m1" },
    ]);
    expect(modules[0].includedInBase).toBe(true);
    expect(modules[0].unitPrice).toBe(0);
  });

  it("never duplicates Pedidos Manutenção Web and Maintenance Requests", () => {
    expect(canonicalModuleName("Pedidos Manutenção Web")).toBe("Maintenance Requests");
    const { modules } = normalizeLicensedItems([
      { module_name: "Pedidos Manutenção Web", module_id: "m1" },
      { module_name: "Maintenance Requests", module_id: "m1" },
    ]);
    expect(modules).toHaveLength(1);
  });

  it("keeps historical/custom modules visible and flags them for review", () => {
    const { modules } = normalizeLicensedItems([{ module_name: "Custom Legacy Reports" }]);
    expect(modules).toHaveLength(1);
    expect(modules[0].needsReview).toBe(true);
  });
});

describe("proposal prepopulation", () => {
  it("builds recurring items from the contract lines and adds no implementation service", () => {
    const items = buildBaselineProposalItems(build());
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.is_recurring)).toBe(true);
    expect(items.some((i) => i.category === "service")).toBe(false);
    expect(items.reduce((s, i) => s + i.total, 0)).toBe(39600);
  });

  it("does not fall back to a generic Plan 1 line when real lines exist", () => {
    const items = buildBaselineProposalItems(build());
    expect(items.some((i) => i.item_code === "plan_1_annual")).toBe(false);
  });
});

describe("financial split and change detection", () => {
  it("separates current recurring, proposed recurring and one-time charges", () => {
    const b = build();
    const f = buildRenewalFinancialSummary({ baseline: b, proposedRecurring: 41580, proposedYear1: 43580 });
    expect(f.currentRecurring).toBe(39600);
    expect(f.proposedRecurring).toBe(41580);
    expect(f.recurringDelta).toBe(1980);
    expect(f.recurringDeltaPct).toBe(5);
    expect(f.oneTimeCharges).toBe(2000);
    expect(f.proposedYear2Plus).toBe(41580);
  });

  it("identifies a straight renewal when nothing changed", () => {
    const b = build();
    const items = buildBaselineProposalItems(b);
    const cmp = compareProposalToBaseline(b, items as any);
    expect(cmp.isStraightRenewal).toBe(true);
    expect(cmp.changes.every((c) => c.kind === "unchanged")).toBe(true);
  });

  it("detects added, removed and price changes", () => {
    const b = build();
    const items = buildBaselineProposalItems(b).slice(1);
    items[0] = { ...items[0], unit_price: 5000, total: 5000 };
    items.push({ ...items[0], item_name: "New plugin", unit_price: 900, total: 900 });
    const cmp = compareProposalToBaseline(b, items as any);
    const kinds = cmp.changes.map((c) => c.kind);
    expect(kinds).toContain("removed");
    expect(kinds).toContain("price_changed");
    expect(kinds).toContain("added");
    expect(cmp.isStraightRenewal).toBe(false);
  });
});
