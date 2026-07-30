/**
 * Contract-line write layer (Phase 2B).
 *
 * Single place that decides what is actually persisted when a contract line is
 * created or edited. Rules:
 *
 * - A create ALWAYS requires an explicitly selected canonical type. The generic
 *   legacy value `recurring` is never written.
 * - An edit of a historic line with an unknown/legacy type preserves the exact
 *   stored value until the user explicitly picks a new classification.
 * - Options and labels come from `contract-lines.ts` — the same source used by
 *   the views and the financial calculations.
 */

import {
  CONTRACT_LINE_TYPES,
  UNCLASSIFIED_LINE_TYPE,
  isCanonicalLineType,
  normalizeBillingFrequency,
  type ContractLineType,
  type EffectiveLineType,
} from "./contract-lines";

/** Billing frequencies offered by the form (canonical persisted values). */
export const BILLING_FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "annual", label: "Annual" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Semiannual" },
  { value: "one_time", label: "One-time" },
];

/** Select options for the line-type field — derived from the canonical source. */
export const LINE_TYPE_OPTIONS = CONTRACT_LINE_TYPES.map((t) => ({
  value: t.value,
  label: t.label,
  hint: t.hint,
}));

/* ───────── legacy → canonical mapping for programmatic writers ───────── */

const WRITE_ALIASES: Record<string, ContractLineType> = {
  software: "license",
  licence: "license",
  license: "license",
  "add-on": "module",
  addon: "module",
  module: "module",
  plugin: "plugin",
  service: "implementation",
  services: "implementation",
  implementation: "implementation",
  training: "training",
  hosting: "hosting",
  saas: "hosting",
  sat: "sat",
  "s&at": "sat",
  support: "sat",
  mww_web: "mww_web",
  "mww web": "mww_web",
  web: "mww_web",
  discount: "discount",
  other: "other",
};

/**
 * Maps a programmatic/legacy category to a canonical type for WRITE paths.
 * Returns null when nothing safe can be decided — callers must then ask the
 * user instead of persisting a generic value.
 */
export function canonicalizeLineTypeForWrite(value: string | null | undefined): ContractLineType | null {
  const k = (value || "").trim().toLowerCase();
  if (!k) return null;
  if (isCanonicalLineType(k)) return k as ContractLineType;
  return WRITE_ALIASES[k] ?? null;
}

/* ───────────────────────── Form state ───────────────────────── */

export interface ContractLineFormState {
  id?: string | null;
  /** Selector value: a canonical type, or the unclassified sentinel. */
  lineType: EffectiveLineType | "";
  description: string;
  amount: string | number | null;
  currency: string;
  billingFrequency: string;
  startDate: string;
  endDate: string;
  notes?: string;
  /** Edit only: the exact stored `line_type`, preserved verbatim. */
  rawLineType?: string | null;
  /** Set to true ONLY when the user explicitly changes the type selector. */
  typeChanged?: boolean;
}

export function emptyContractLineForm(defaults: Partial<ContractLineFormState> = {}): ContractLineFormState {
  return {
    lineType: "",
    description: "",
    amount: "",
    currency: "EUR",
    billingFrequency: "annual",
    startDate: "",
    endDate: "",
    notes: "",
    rawLineType: null,
    typeChanged: false,
    ...defaults,
  };
}

export function contractLineFormFromRow(row: {
  id?: string | null;
  line_type?: string | null;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
  billing_frequency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
}): ContractLineFormState {
  const canonical = isCanonicalLineType(row.line_type) ? (row.line_type as ContractLineType) : null;
  return {
    id: row.id ?? null,
    lineType: canonical ?? UNCLASSIFIED_LINE_TYPE,
    description: row.description ?? "",
    amount: row.amount ?? "",
    currency: row.currency ?? "EUR",
    billingFrequency: row.billing_frequency ?? "",
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    notes: row.notes ?? "",
    rawLineType: row.line_type ?? null,
    typeChanged: false,
  };
}

/* ───────────────────────── Validation ───────────────────────── */

export interface ContractLineValidation {
  ok: boolean;
  errors: Record<string, string>;
}

export function validateContractLineForm(
  form: ContractLineFormState,
  mode: "create" | "edit"
): ContractLineValidation {
  const errors: Record<string, string> = {};

  if (mode === "create" || form.typeChanged) {
    if (!isCanonicalLineType(form.lineType)) {
      errors.lineType = "Select a line type";
    }
  }
  if (!String(form.description || "").trim()) errors.description = "Description is required";

  const amount = Number(form.amount);
  if (form.amount === "" || form.amount === null || form.amount === undefined || !Number.isFinite(amount)) {
    errors.amount = "Amount is required";
  }
  if (!String(form.currency || "").trim()) errors.currency = "Currency is required";
  if (normalizeBillingFrequency(form.billingFrequency) === "unknown") {
    errors.billingFrequency = "Billing frequency is required";
  }
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    errors.endDate = "End date must be after the start date";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/* ───────────────────────── Payloads ───────────────────────── */

export interface ContractLineWritePayload {
  line_type: string;
  description: string;
  amount: number;
  currency: string;
  billing_frequency: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  [key: string]: any;
}

/**
 * Resolves the `line_type` actually written.
 * - create → the explicitly selected canonical type;
 * - edit   → the selected canonical type only when the user changed the
 *            selector; otherwise the exact raw stored value is preserved.
 */
export function resolveWrittenLineType(form: ContractLineFormState, mode: "create" | "edit"): string {
  if (mode === "create") {
    if (!isCanonicalLineType(form.lineType)) {
      throw new Error("A canonical contract line type must be selected");
    }
    return form.lineType;
  }
  if (form.typeChanged && isCanonicalLineType(form.lineType)) return form.lineType;
  return form.rawLineType ?? "";
}

function baseFields(form: ContractLineFormState) {
  return {
    description: String(form.description || "").trim(),
    amount: Number(form.amount),
    currency: String(form.currency || "EUR").trim().toUpperCase(),
    billing_frequency: String(form.billingFrequency || "").trim(),
    start_date: form.startDate || null,
    end_date: form.endDate || null,
    notes: form.notes?.trim() ? form.notes.trim() : null,
  };
}

export function buildContractLineCreatePayload(
  form: ContractLineFormState,
  ctx: { contract_id: string; client_id?: string | null; source?: string }
): ContractLineWritePayload {
  return {
    contract_id: ctx.contract_id,
    client_id: ctx.client_id ?? null,
    line_type: resolveWrittenLineType(form, "create"),
    source: ctx.source ?? "manual",
    ...baseFields(form),
  };
}

export function buildContractLineUpdatePayload(form: ContractLineFormState): ContractLineWritePayload {
  return {
    line_type: resolveWrittenLineType(form, "edit"),
    ...baseFields(form),
  };
}
