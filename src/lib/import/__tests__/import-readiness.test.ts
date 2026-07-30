import { describe, it, expect } from "vitest";
import { validateImportBatch, importIdentityKey, normalizeImportModules } from "@/lib/import/import-validator";
import { buildImportPlan } from "@/lib/import/import-planner";
import type { ImportClientInput } from "@/lib/import/import-types";
import { WATSONS_FIXTURE, WATSONS_APPROVED, FITC_PARTNER_UUID } from "./watsons.fixture";

const PARTNER = "b6a3f0f2-6f0e-4a1e-9c4a-2f0b1d7e9c31";

function baseRow(overrides: Partial<ImportClientInput> = {}): ImportClientInput {
  return {
    source_system: "lic",
    external_client_id: "A-1",
    commercial_name: "Alpha Industries",
    country: "PT",
    partner_uuid: PARTNER,
    license: { product: "Business UseIT", deployment: "SaaS", version: "7.2.6.0", backoffice_users: 3, modules: [] },
    contract: {
      contract_start_date: "2024-01-01",
      contract_end_date: "2025-01-01",
      currency: "EUR",
      lines: [{ line_type: "license", description: "License", amount: 1000, currency: "EUR", billing_frequency: "Annual" }],
    },
    renewal: { renewal_date: "2025-01-01" },
    declared_totals: { recurring_arr: 1000, one_time: 0, year_1: 1000 },
    lifecycle_events: [{ event_type: "client_imported", event_title: "Client imported", technical: true }],
    ...overrides,
  };
}

describe("import validator", () => {
  it("accepts a valid row and produces a deterministic preview", () => {
    const batch = validateImportBatch([baseRow()]);
    expect(batch.summary).toEqual({ total: 1, valid: 1, needs_review: 0, blocked: 0 });
    const p = batch.rows[0].normalizedPreview;
    expect(p.identityKey).toBe("lic:A-1");
    expect(p.totals).toEqual({ recurring_arr: 1000, one_time: 0, year_1: 1000 });
    expect(p.partner_uuid).toBe(PARTNER);
    expect(JSON.stringify(validateImportBatch([baseRow()]).rows[0].normalizedPreview)).toBe(JSON.stringify(p));
  });

  it("blocks duplicate external keys inside the batch", () => {
    const batch = validateImportBatch([baseRow(), baseRow({ commercial_name: "Alpha Other" })]);
    expect(batch.rows.every((r) => r.state === "blocked")).toBe(true);
    expect(batch.rows[0].errors.some((e) => e.code === "duplicate_identity_key")).toBe(true);
  });

  it("blocks duplicate confirmed client_code inside the batch", () => {
    const row = baseRow({ source_system: null, external_client_id: null, client_code: "PT-WAT-1", client_code_confirmed: true });
    const batch = validateImportBatch([row, { ...row, commercial_name: "Other" }]);
    expect(batch.summary.blocked).toBe(2);
  });

  it("blocks a row with no stable identity key", () => {
    const batch = validateImportBatch([baseRow({ source_system: null, external_client_id: null, client_code: "X", client_code_confirmed: false })]);
    expect(batch.rows[0].state).toBe("blocked");
    expect(batch.rows[0].errors.some((e) => e.code === "missing_identity_key")).toBe(true);
  });

  it("warns (never merges) on a name collision with production", () => {
    const batch = validateImportBatch([baseRow()], { existingNames: ["alpha industries"] });
    expect(batch.rows[0].state).toBe("needs_review");
    expect(batch.rows[0].warnings.some((w) => w.code === "name_collision")).toBe(true);
    expect(batch.rows[0].errors).toHaveLength(0);
    expect(buildImportPlan(batch).operations).toHaveLength(0);
  });

  it("blocks a legacy-only partner reference and never promotes it", () => {
    const batch = validateImportBatch([baseRow({ partner_uuid: null, legacy_partner_id: "FITC" })]);
    expect(batch.rows[0].state).toBe("blocked");
    expect(batch.rows[0].errors.some((e) => e.code === "missing_partner_uuid")).toBe(true);
    expect(batch.rows[0].normalizedPreview.partner_uuid).toBeNull();
    expect(batch.rows[0].normalizedPreview.legacy_partner_id).toBe("FITC");
  });

  it("blocks a non-uuid partner_uuid", () => {
    const batch = validateImportBatch([baseRow({ partner_uuid: "FITC-01" })]);
    expect(batch.rows[0].errors.some((e) => e.code === "invalid_partner_uuid")).toBe(true);
  });

  it("blocks incomplete financial lines instead of inventing values", () => {
    const batch = validateImportBatch([
      baseRow({
        contract: {
          contract_start_date: "2024-01-01",
          contract_end_date: "2025-01-01",
          currency: "EUR",
          lines: [{ line_type: "recurring", description: "Stuff", amount: null, currency: "", billing_frequency: "" }],
        },
        declared_totals: null,
      }),
    ]);
    const codes = batch.rows[0].errors.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(["line_type_not_canonical", "line_missing_amount", "line_missing_currency", "line_missing_frequency"]));
    expect(batch.rows[0].state).toBe("blocked");
  });

  it("blocks a large declared-vs-computed total mismatch and never corrects it", () => {
    const batch = validateImportBatch([baseRow({ declared_totals: { recurring_arr: 5000, one_time: 0, year_1: 5000 } })]);
    expect(batch.rows[0].state).toBe("blocked");
    expect(batch.rows[0].errors.some((e) => e.code === "totals_mismatch")).toBe(true);
    expect(batch.rows[0].normalizedPreview.totals.recurring_arr).toBe(1000);
  });

  it("flags a renewal date that diverges from the contract end date", () => {
    const batch = validateImportBatch([baseRow({ renewal: { renewal_date: "2026-05-05" } })]);
    expect(batch.rows[0].state).toBe("needs_review");
    expect(batch.rows[0].warnings.some((w) => w.code === "renewal_date_differs_from_contract_end")).toBe(true);
  });

  it("marks lifecycle events without a historical date as unknown, import stays technical", () => {
    const batch = validateImportBatch([
      baseRow({ lifecycle_events: [{ event_type: "client_imported", event_title: "Client imported", technical: true }, { event_type: "note", event_title: "Legacy note" }] }),
    ]);
    const events = batch.rows[0].normalizedPreview.lifecycle_events;
    expect(events[0]).toMatchObject({ technical: true, occurred_at_known: false });
    expect(events[1]).toMatchObject({ technical: false, occurred_at_known: false, occurred_at: null });
    expect(batch.rows[0].warnings.some((w) => w.code === "lifecycle_event_date_unknown")).toBe(true);
  });

  it("keeps an empty license version empty", () => {
    const batch = validateImportBatch([baseRow({ license: { product: "Business UseIT", deployment: "SaaS", version: "", backoffice_users: 2 } })]);
    expect(batch.rows[0].normalizedPreview.license?.version).toBe("");
  });

  it("requires BackOffice users as the licensed quantity", () => {
    const batch = validateImportBatch([baseRow({ license: { product: "Business UseIT", deployment: "SaaS", backoffice_users: 0 } })]);
    expect(batch.rows[0].errors.some((e) => e.code === "invalid_backoffice_users")).toBe(true);
  });

  it("normalizes modules: Base-included dropped, alias mapped, LIC counters ignored", () => {
    const r = normalizeImportModules(["Cost Budget Control", "Pedidos Manutenção Web", "Employee Accesses", "License Version"]);
    expect(r.modules).toEqual(["Maintenance Requests"]);
    expect(r.includedInBase).toEqual(["Cost Budget Control"]);
    expect(r.ignored).toEqual(["Employee Accesses", "License Version"]);
  });

  it("derives identity keys deterministically", () => {
    expect(importIdentityKey(baseRow())).toBe("lic:A-1");
    expect(importIdentityKey(baseRow({ source_system: null, external_client_id: null }))).toBeNull();
  });
});

describe("import planner", () => {
  it("orders operations and emits stable idempotency keys", () => {
    const batch = validateImportBatch([baseRow()]);
    const plan = buildImportPlan(batch);
    expect(plan.operations.map((o) => o.table)).toEqual([
      "clients",
      "licenses",
      "contracts",
      "contract_lines",
      "renewals",
      "lifecycle_events",
    ]);
    expect(plan.operations.every((o) => o.mode === "insert_if_absent")).toBe(true);
    const keys = plan.operations.map((o) => o.idempotencyKey);
    expect(keys).toContain("lic:A-1#client");
    // Re-planning identical input yields identical keys.
    expect(buildImportPlan(validateImportBatch([baseRow()])).operations.map((o) => o.idempotencyKey)).toEqual(keys);
  });

  it("produces zero operations for needs_review and blocked rows", () => {
    const batch = validateImportBatch([baseRow({ partner_uuid: null }), baseRow({ external_client_id: "A-2", renewal: { renewal_date: "2030-01-01" } })]);
    const plan = buildImportPlan(batch);
    expect(plan.operations).toHaveLength(0);
    expect(plan.skipped.map((s) => s.state).sort()).toEqual(["blocked", "needs_review"]);
  });

  it("builds a self-contained rollback manifest in reverse dependency order", () => {
    const plan = buildImportPlan(validateImportBatch([baseRow()]));
    expect(plan.rollbackManifest.map((g) => g.table)).toEqual([
      "lifecycle_events",
      "renewals",
      "contract_lines",
      "contracts",
      "licenses",
      "clients",
    ]);
    expect(plan.rollbackManifest.at(-1)?.idempotencyKeys).toEqual(["lic:A-1#client"]);
  });
});

describe("Watsons regression fixture (read-only)", () => {
  const batch = validateImportBatch([WATSONS_FIXTURE]);
  const row = batch.rows[0];

  it("reproduces the approved mapping without errors", () => {
    expect(row.errors).toEqual([]);
    expect(row.normalizedPreview.partner_uuid).toBe(FITC_PARTNER_UUID);
    expect(row.normalizedPreview.license).toMatchObject({
      deployment: WATSONS_APPROVED.deployment,
      version: WATSONS_APPROVED.operational_version,
      backoffice_users: WATSONS_APPROVED.backoffice_users,
      modules: ["Maintenance Requests"],
      first_installation_date: WATSONS_APPROVED.first_installation_date,
    });
  });

  it("reconciles ARR / Year 1 / one-time and the renewal date", () => {
    expect(row.normalizedPreview.totals).toEqual({
      recurring_arr: WATSONS_APPROVED.recurring_arr,
      one_time: WATSONS_APPROVED.one_time,
      year_1: WATSONS_APPROVED.year_1,
    });
    expect(row.normalizedPreview.renewal?.renewal_date).toBe(WATSONS_APPROVED.renewal_date);
  });

  it("keeps client_imported technical and does not duplicate the existing client", () => {
    const events = row.normalizedPreview.lifecycle_events;
    expect(events.find((e) => e.event_type === "client_imported")?.technical).toBe(true);
    expect(events.find((e) => e.event_type === "license_created")?.occurred_at).toBe("2022-07-19");
    // The plan is insert-only and matched by external key — never by name.
    const plan = buildImportPlan(batch);
    expect(plan.operations.every((o) => o.mode === "insert_if_absent")).toBe(true);
    expect(new Set(plan.operations.map((o) => o.idempotencyKey)).size).toBe(plan.operations.length);
  });
});
