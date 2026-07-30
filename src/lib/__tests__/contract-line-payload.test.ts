import { describe, it, expect } from "vitest";
import {
  BILLING_FREQUENCY_OPTIONS,
  LINE_TYPE_OPTIONS,
  buildContractLineCreatePayload,
  buildContractLineUpdatePayload,
  canonicalizeLineTypeForWrite,
  contractLineFormFromRow,
  emptyContractLineForm,
  validateContractLineForm,
} from "../contract-line-payload";
import { CONTRACT_LINE_TYPES, UNCLASSIFIED_LINE_TYPE } from "../contract-lines";

describe("contract line form options", () => {
  it("derives its options from the shared canonical vocabulary", () => {
    expect(LINE_TYPE_OPTIONS.map((o) => o.value)).toEqual(CONTRACT_LINE_TYPES.map((t) => t.value));
    expect(LINE_TYPE_OPTIONS.some((o) => o.value === "recurring" as any)).toBe(false);
    expect(BILLING_FREQUENCY_OPTIONS.map((o) => o.value)).toContain("annual");
  });
});

describe("validation", () => {
  it("requires an explicit canonical type on create", () => {
    const v = validateContractLineForm(
      emptyContractLineForm({ description: "X", amount: 10 }),
      "create"
    );
    expect(v.ok).toBe(false);
    expect(v.errors.lineType).toBeTruthy();
  });

  it("requires description, amount, currency and billing frequency", () => {
    const v = validateContractLineForm(
      emptyContractLineForm({ lineType: "sat", billingFrequency: "" }),
      "create"
    );
    expect(v.errors.description).toBeTruthy();
    expect(v.errors.amount).toBeTruthy();
    expect(v.errors.billingFrequency).toBeTruthy();
  });

  it("accepts a complete create form", () => {
    const v = validateContractLineForm(
      emptyContractLineForm({
        lineType: "sat", description: "S&AT", amount: 2301.6,
        currency: "EUR", billingFrequency: "annual",
        startDate: "2026-07-19", endDate: "2027-07-19",
      }),
      "create"
    );
    expect(v.ok).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const v = validateContractLineForm(
      emptyContractLineForm({
        lineType: "sat", description: "S&AT", amount: 1, startDate: "2027-01-01", endDate: "2026-01-01",
      }),
      "create"
    );
    expect(v.errors.endDate).toBeTruthy();
  });

  it("allows saving a historic unclassified line without picking a type", () => {
    const form = contractLineFormFromRow({
      id: "l1", line_type: "recurring", description: "Legacy bundle",
      amount: 500, currency: "EUR", billing_frequency: "annual",
    });
    expect(validateContractLineForm(form, "edit").ok).toBe(true);
  });
});

describe("create payload", () => {
  it("persists the explicitly selected canonical type and all commercial fields", () => {
    const payload = buildContractLineCreatePayload(
      emptyContractLineForm({
        lineType: "hosting", typeChanged: true, description: "SaaS Hosting",
        amount: "1200", currency: "eur", billingFrequency: "annual",
        startDate: "2026-07-19", endDate: "2027-07-19", notes: " keep ",
      }),
      { contract_id: "c1", client_id: "cl1" }
    );
    expect(payload).toMatchObject({
      contract_id: "c1",
      client_id: "cl1",
      line_type: "hosting",
      description: "SaaS Hosting",
      amount: 1200,
      currency: "EUR",
      billing_frequency: "annual",
      start_date: "2026-07-19",
      end_date: "2027-07-19",
      notes: "keep",
    });
  });

  it("never writes the generic legacy 'recurring' type", () => {
    expect(() =>
      buildContractLineCreatePayload(
        emptyContractLineForm({ lineType: "recurring" as any, description: "x", amount: 1 }),
        { contract_id: "c1" }
      )
    ).toThrow();
  });
});

describe("edit payload — historic value preservation", () => {
  const legacyRow = {
    id: "l1", line_type: "recurring", description: "Legacy recurring bundle",
    amount: 4221.6, currency: "EUR", billing_frequency: "annual",
    start_date: "2026-07-19", end_date: "2027-07-19",
  };

  it("shows the line as unclassified but keeps the raw stored type", () => {
    const form = contractLineFormFromRow(legacyRow);
    expect(form.lineType).toBe(UNCLASSIFIED_LINE_TYPE);
    expect(form.rawLineType).toBe("recurring");
    expect(form.typeChanged).toBe(false);
  });

  it("preserves the raw legacy type when the user does not change the selector", () => {
    const form = contractLineFormFromRow(legacyRow);
    const payload = buildContractLineUpdatePayload({ ...form, description: "Legacy recurring bundle (2027)" });
    expect(payload.line_type).toBe("recurring");
    expect(payload.description).toBe("Legacy recurring bundle (2027)");
    expect(payload.amount).toBe(4221.6);
  });

  it("writes the canonical type only when explicitly changed", () => {
    const form = contractLineFormFromRow(legacyRow);
    const payload = buildContractLineUpdatePayload({ ...form, lineType: "sat", typeChanged: true });
    expect(payload.line_type).toBe("sat");
  });

  it("preserves a canonical type untouched on edit", () => {
    const form = contractLineFormFromRow({ ...legacyRow, line_type: "sat" });
    expect(form.lineType).toBe("sat");
    expect(buildContractLineUpdatePayload(form).line_type).toBe("sat");
  });

  it("preserves an unknown non-generic legacy type verbatim", () => {
    const form = contractLineFormFromRow({ ...legacyRow, line_type: "Manutencao Anual" });
    expect(form.lineType).toBe(UNCLASSIFIED_LINE_TYPE);
    expect(buildContractLineUpdatePayload(form).line_type).toBe("Manutencao Anual");
  });
});

describe("canonicalizeLineTypeForWrite", () => {
  it("maps legacy programmatic categories to canonical types", () => {
    expect(canonicalizeLineTypeForWrite("Software")).toBe("license");
    expect(canonicalizeLineTypeForWrite("service")).toBe("implementation");
    expect(canonicalizeLineTypeForWrite("Add-on")).toBe("module");
    expect(canonicalizeLineTypeForWrite("sat")).toBe("sat");
  });

  it("returns null for values that cannot be safely decided", () => {
    expect(canonicalizeLineTypeForWrite("recurring")).toBeNull();
    expect(canonicalizeLineTypeForWrite("")).toBeNull();
  });
});
