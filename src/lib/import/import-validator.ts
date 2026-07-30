/**
 * PHASE 4 — Pure batch validator / preview for production client imports.
 *
 * No IO. No Supabase. No writes. Given a batch of prepared client records it
 * returns, per row: valid | needs_review | blocked + errors + warnings +
 * a deterministic normalized preview.
 *
 * Non-negotiable rules encoded here:
 *  - a partner client REQUIRES a canonical `partner_uuid` (uuid); a legacy
 *    text `partner_id` is NEVER promoted to a relation;
 *  - a stable external key (source_system + external_client_id) or an
 *    explicitly confirmed client_code is required — no implicit identity;
 *  - duplicates inside the batch (identity key) BLOCK both rows;
 *  - name collisions are WARNINGS only — never an automatic merge;
 *  - financial totals are reconciled, never guessed or corrected;
 *  - business dates are kept apart from technical import timestamps.
 */

import { isUuid } from "@/lib/partner-identity";
import {
  isCanonicalLineType,
  normalizeBillingFrequency,
  computeContractFinancials,
} from "@/lib/contract-lines";
import { normalizeLicenseProduct, normalizeDeployment, normalizeVersion } from "@/lib/licensing";
import type {
  ImportClientInput,
  ImportIssue,
  ImportRowState,
  NormalizedPreview,
  ValidatedImportBatch,
  ValidatedImportRow,
} from "./import-types";

/** Tolerance (currency units) below which a totals difference is ignored. */
const TOTALS_EPSILON = 0.01;
/** Above this difference the row is blocked instead of flagged for review. */
const TOTALS_BLOCK_THRESHOLD = 1;

/**
 * LIC fields that never become licensed quantities. `Employee Accesses` is an
 * operational counter, and the LIC structural license version is not the
 * operational product version.
 */
export const IGNORED_LIC_FIELDS = ["employee accesses", "license version"];

/**
 * Modules already included in the Base license — importing them as separate
 * modules would double count. Read-only mapping, applied to the preview only.
 */
export const BASE_INCLUDED_MODULES = ["cost budget control"];

/** Legacy/localised module names mapped to the canonical catalog name. */
export const MODULE_ALIASES: Record<string, string> = {
  "pedidos manutencao web": "Maintenance Requests",
  "pedidos manutenção web": "Maintenance Requests",
  "maintenance requests": "Maintenance Requests",
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export interface NormalizedModules {
  modules: string[];
  includedInBase: string[];
  ignored: string[];
}

export function normalizeImportModules(input: string[] | null | undefined): NormalizedModules {
  const modules: string[] = [];
  const includedInBase: string[] = [];
  const ignored: string[] = [];
  for (const raw of input || []) {
    const k = norm(raw);
    if (!k) continue;
    if (IGNORED_LIC_FIELDS.includes(k)) {
      ignored.push(String(raw).trim());
      continue;
    }
    if (BASE_INCLUDED_MODULES.includes(k)) {
      includedInBase.push(String(raw).trim());
      continue;
    }
    const canonical = MODULE_ALIASES[k] || String(raw).trim();
    if (!modules.includes(canonical)) modules.push(canonical);
  }
  return { modules, includedInBase, ignored };
}

/** Stable identity key for a prepared row, or null when none is usable. */
export function importIdentityKey(input: ImportClientInput): string | null {
  const system = (input.source_system || "").trim().toLowerCase();
  const ext = (input.external_client_id || "").trim();
  if (system && ext) return `${system}:${ext}`;
  const code = (input.client_code || "").trim();
  if (code && input.client_code_confirmed) return `client_code:${code.toUpperCase()}`;
  return null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && ISO_DATE.test(v.trim());

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validateRow(input: ImportClientInput, index: number): ValidatedImportRow {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  /* ---- identity ---- */
  const identityKey = importIdentityKey(input);
  if (!identityKey) {
    errors.push({
      code: "missing_identity_key",
      field: "external_client_id",
      message:
        "No stable external key. Provide source_system + external_client_id, or a client_code explicitly confirmed by a human.",
    });
  }
  if (!(input.commercial_name || "").trim()) {
    errors.push({ code: "missing_name", field: "commercial_name", message: "commercial_name is required." });
  }

  /* ---- partner relation ---- */
  let partnerUuid: string | null = null;
  if (input.hq_direct) {
    if (input.partner_uuid) {
      errors.push({
        code: "hq_direct_with_partner",
        field: "partner_uuid",
        message: "hq_direct is set but a partner_uuid was also provided.",
      });
    }
  } else if (isUuid(input.partner_uuid)) {
    partnerUuid = String(input.partner_uuid).trim();
  } else if (input.partner_uuid) {
    errors.push({
      code: "invalid_partner_uuid",
      field: "partner_uuid",
      message: "partner_uuid is not a valid uuid. Legacy references are never promoted to a relation.",
    });
  } else {
    errors.push({
      code: "missing_partner_uuid",
      field: "partner_uuid",
      message: (input.legacy_partner_id || "").trim()
        ? "Only a legacy partner reference is available. Resolve the canonical partner_uuid manually — it is never inferred."
        : "partner_uuid is required for a partner client (or set hq_direct).",
    });
  }

  /* ---- license ---- */
  let licensePreview: NormalizedPreview["license"] = null;
  if (input.license) {
    const lic = input.license;
    const product = normalizeLicenseProduct(lic.product);
    if (!lic.product || product.isUnmapped) {
      warnings.push({
        code: "license_product_not_canonical",
        field: "license.product",
        message: `Product "${lic.product || "(empty)"}" is not in the canonical vocabulary — needs human review.`,
      });
    }
    const deployment = normalizeDeployment(lic.deployment);
    if (!deployment.value) {
      warnings.push({
        code: "deployment_not_canonical",
        field: "license.deployment",
        message: "Hosting/deployment could not be resolved to SaaS or On-Premise.",
      });
    }
    const users = lic.backoffice_users;
    if (users == null || !Number.isFinite(users) || users <= 0) {
      errors.push({
        code: "invalid_backoffice_users",
        field: "license.backoffice_users",
        message: "BackOffice users (number of licenses) is required and must be > 0.",
      });
    }
    if (lic.first_installation_date && !isDate(lic.first_installation_date)) {
      errors.push({
        code: "invalid_first_installation_date",
        field: "license.first_installation_date",
        message: "first_installation_date must be an ISO date (YYYY-MM-DD).",
      });
    }
    const mods = normalizeImportModules(lic.modules);
    for (const m of mods.includedInBase) {
      warnings.push({
        code: "module_included_in_base",
        field: "license.modules",
        message: `"${m}" is included in the Base license and was not imported as a separate module.`,
      });
    }
    licensePreview = {
      product: product.value || "",
      productIsCanonical: !product.isUnmapped && !!product.value,
      deployment: deployment.value || deployment.raw || "",
      // Empty version stays empty — never defaulted to the suggested version.
      version: normalizeVersion(lic.version),
      backoffice_users: users ?? null,
      modules: mods.modules,
      first_installation_date: isDate(lic.first_installation_date) ? lic.first_installation_date! : null,
    };
  }

  /* ---- contract + lines ---- */
  let contractPreview: NormalizedPreview["contract"] = null;
  let totals = { recurring_arr: 0, one_time: 0, year_1: 0 };
  if (input.contract) {
    const c = input.contract;
    if (c.contract_start_date && !isDate(c.contract_start_date)) {
      errors.push({ code: "invalid_contract_start", field: "contract.contract_start_date", message: "Invalid contract_start_date." });
    }
    if (c.contract_end_date && !isDate(c.contract_end_date)) {
      errors.push({ code: "invalid_contract_end", field: "contract.contract_end_date", message: "Invalid contract_end_date." });
    }
    const lines = c.lines || [];
    if (lines.length === 0) {
      warnings.push({ code: "contract_without_lines", field: "contract.lines", message: "Contract has no lines — no totals can be derived." });
    }
    lines.forEach((l, i) => {
      const where = `contract.lines[${i}]`;
      if (!isCanonicalLineType(l.line_type)) {
        errors.push({ code: "line_type_not_canonical", field: `${where}.line_type`, message: `"${l.line_type}" is not a canonical contract line type.` });
      }
      if (l.amount == null || !Number.isFinite(l.amount)) {
        errors.push({ code: "line_missing_amount", field: `${where}.amount`, message: "Line amount is required — it is never inferred." });
      }
      if (!(l.currency || "").trim()) {
        errors.push({ code: "line_missing_currency", field: `${where}.currency`, message: "Line currency is required." });
      }
      if (normalizeBillingFrequency(l.billing_frequency) === "unknown") {
        errors.push({ code: "line_missing_frequency", field: `${where}.billing_frequency`, message: "Explicit billing_frequency is required." });
      }
      if (!(l.description || "").trim()) {
        warnings.push({ code: "line_missing_description", field: `${where}.description`, message: "Line has no description." });
      }
    });

    const fin = computeContractFinancials(
      lines.map((l) => ({
        line_type: l.line_type,
        description: l.description,
        amount: l.amount ?? 0,
        currency: l.currency,
        billing_frequency: l.billing_frequency,
      })),
    );
    if (fin.mixedCurrency) {
      errors.push({ code: "mixed_currency", field: "contract.lines", message: "Contract lines mix currencies — totals cannot be reconciled." });
    }
    totals = {
      recurring_arr: round2(fin.recurringArr),
      one_time: round2(fin.oneTimeValue),
      year_1: round2(fin.year1Value),
    };
    contractPreview = {
      start_date: isDate(c.contract_start_date) ? c.contract_start_date! : null,
      end_date: isDate(c.contract_end_date) ? c.contract_end_date! : null,
      currency: (c.currency || fin.currency || "EUR").toUpperCase(),
      lines: lines.map((l) => ({
        line_type: l.line_type,
        description: (l.description || "").trim(),
        amount: Number(l.amount ?? 0),
        currency: (l.currency || "EUR").toUpperCase(),
        billing_frequency: String(l.billing_frequency || "").trim(),
      })),
    };
  }

  /* ---- declared totals reconciliation (never auto-corrected) ---- */
  const declared = input.declared_totals;
  if (declared) {
    const checks: Array<[string, number | null | undefined, number]> = [
      ["recurring_arr", declared.recurring_arr, totals.recurring_arr],
      ["one_time", declared.one_time, totals.one_time],
      ["year_1", declared.year_1, totals.year_1],
    ];
    for (const [field, declaredValue, computed] of checks) {
      if (declaredValue == null) continue;
      const diff = Math.abs(round2(Number(declaredValue)) - computed);
      if (diff <= TOTALS_EPSILON) continue;
      const issue: ImportIssue = {
        code: "totals_mismatch",
        field: `declared_totals.${field}`,
        message: `Declared ${field} ${declaredValue} does not match the computed ${computed}. Values are never adjusted automatically.`,
      };
      if (diff > TOTALS_BLOCK_THRESHOLD) errors.push(issue);
      else warnings.push(issue);
    }
  }

  /* ---- renewal ---- */
  let renewalPreview: NormalizedPreview["renewal"] = null;
  if (input.renewal) {
    const r = input.renewal;
    if (!isDate(r.renewal_date)) {
      errors.push({ code: "invalid_renewal_date", field: "renewal.renewal_date", message: "renewal_date must be an ISO date." });
    } else if (contractPreview?.end_date && contractPreview.end_date !== r.renewal_date) {
      warnings.push({
        code: "renewal_date_differs_from_contract_end",
        field: "renewal.renewal_date",
        message: `renewal_date ${r.renewal_date} differs from contract_end_date ${contractPreview.end_date}.`,
      });
    }
    renewalPreview = {
      renewal_date: isDate(r.renewal_date) ? r.renewal_date! : null,
      estimated_value: Number(r.estimated_value ?? totals.recurring_arr) || 0,
    };
  }

  /* ---- lifecycle events ---- */
  const events = (input.lifecycle_events || []).map((e) => {
    const known = isDate(e.occurred_at);
    if (!known && !e.technical) {
      warnings.push({
        code: "lifecycle_event_date_unknown",
        field: "lifecycle_events",
        message: `Event "${e.event_title}" has no historical date — it will be recorded as unknown.`,
      });
    }
    return {
      event_type: e.event_type,
      event_title: e.event_title,
      occurred_at: known ? e.occurred_at! : null,
      occurred_at_known: known,
      // The import act itself is technical, never a business date.
      technical: !!e.technical,
    };
  });

  const normalizedPreview: NormalizedPreview = {
    identityKey: identityKey || "",
    commercial_name: (input.commercial_name || "").trim(),
    country: (input.country || "").trim() || null,
    partner_uuid: partnerUuid,
    legacy_partner_id: (input.legacy_partner_id || "").trim() || null,
    license: licensePreview,
    contract: contractPreview,
    totals,
    renewal: renewalPreview,
    lifecycle_events: events,
  };

  const state: ImportRowState = errors.length > 0 ? "blocked" : warnings.length > 0 ? "needs_review" : "valid";
  return { index, state, errors, warnings, normalizedPreview, input };
}

/**
 * Validates a whole batch. Cross-row checks (duplicate identity keys, name
 * collisions) are applied after the per-row pass.
 *
 * `existingNames` are commercial names already present in production, used for
 * a human-review warning only — no automatic match, merge or dedupe by name.
 */
export function validateImportBatch(
  inputs: ImportClientInput[],
  options: { existingNames?: string[] } = {},
): ValidatedImportBatch {
  const rows = (inputs || []).map((input, i) => validateRow(input, i));

  // Duplicate identity keys inside the batch block every involved row.
  const byKey = new Map<string, ValidatedImportRow[]>();
  for (const row of rows) {
    const key = row.normalizedPreview.identityKey;
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) || []), row]);
  }
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    for (const row of group) {
      row.errors.push({
        code: "duplicate_identity_key",
        field: "external_client_id",
        message: `Identity key "${key}" appears ${group.length} times in this batch.`,
      });
      row.state = "blocked";
    }
  }

  // Name collisions: warning only, inside the batch and against production.
  const existing = new Set((options.existingNames || []).map(norm).filter(Boolean));
  const nameCount = new Map<string, number>();
  for (const row of rows) nameCount.set(norm(row.normalizedPreview.commercial_name), (nameCount.get(norm(row.normalizedPreview.commercial_name)) || 0) + 1);
  for (const row of rows) {
    const n = norm(row.normalizedPreview.commercial_name);
    if (!n) continue;
    const collides = existing.has(n) || (nameCount.get(n) || 0) > 1;
    if (!collides) continue;
    row.warnings.push({
      code: "name_collision",
      field: "commercial_name",
      message: `A client named "${row.normalizedPreview.commercial_name}" already exists or repeats in the batch. Review manually — records are never merged by name.`,
    });
    if (row.state === "valid") row.state = "needs_review";
  }

  return {
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((r) => r.state === "valid").length,
      needs_review: rows.filter((r) => r.state === "needs_review").length,
      blocked: rows.filter((r) => r.state === "blocked").length,
    },
  };
}
