/**
 * FIN02 R1 source contract between current Business UI engine and a future
 * independently authorized server quote/freeze operation.
 *
 * This routine never approves money, never generates an authorization hash and
 * never sends prices to the backend. It exposes where the existing engine's
 * legal display defaults/negotiated Custom/Onsite values lack provenance.
 *
 * The server must fetch its OWN active pricing_rules and immutable revisions.
 */
import type { PricingRule, ProposalLicenseModel } from "@/types/proposal";
import type { BusinessConfig } from "./proposal-business-engine";
import { requiredBusinessRuleCodes } from "./proposal-business-readiness";

export type BusinessSourceGap =
  | "SOURCE_RULE_MISSING_OR_INACTIVE"
  | "SOURCE_RULE_DUPLICATE_ACTIVE_CODE"
  | "SOURCE_RULE_INVALID_EURO_VALUE"
  | "SOURCE_CUSTOM_PRICE_NEEDS_APPROVAL"
  | "SOURCE_ONSITE_RATE_NEEDS_VERSION"
  | "SOURCE_CATALOG_NEEDS_IMMUTABLE_REVISION";

export interface BusinessSourceCoverage {
  readonly requiredCodes: readonly string[];
  readonly missing: readonly string[];
  readonly duplicate: readonly string[];
  readonly invalid: readonly string[];
  readonly gaps: readonly BusinessSourceGap[];
  /** Catalog input shape is complete, NOT an official server quotation. */
  readonly shapeCompatible: boolean;
  /** Until a trusted historic revision ledger exists, ALWAYS false. */
  readonly commerciallyFrozen: false;
}

/** The engine currently FALLS BACK to 490/240/37 if rules are missing.
 * An official server price freeze must not silently adopt these defaults.
 */
export const BUSINESS_AUTHORITY_DEFAULT_CODES = [
  "BUS_BASE_SAT_DAY",
  "BUS_BASE_DEFAULT_WEB",
] as const;
export const BUSINESS_USEIT_DERIVATION_CODE = "BUS_USEIT_FACTOR";

export function inspectBusinessPricingSourceCoverage(
  rules: readonly PricingRule[],
  cfg: BusinessConfig,
  models: readonly ProposalLicenseModel[] = ["keepit", "useit"],
): BusinessSourceCoverage {
  const requiredCodes = Array.from(new Set([
    ...requiredBusinessRuleCodes(cfg, [...models]),
    ...BUSINESS_AUTHORITY_DEFAULT_CODES,
    ...(models.includes("useit") ? [BUSINESS_USEIT_DERIVATION_CODE] : []),
  ])).sort();

  const missing: string[] = [];
  const duplicate: string[] = [];
  const invalid: string[] = [];
  for (const code of requiredCodes) {
    const active = rules.filter(r => r?.active !== false && r?.code === code);
    if (active.length === 0) {
      missing.push(code);
    } else if (active.length > 1) {
      duplicate.push(code);
    }
    for (const r of active) {
      if (!r.id || r.currency !== "EUR" || !Number.isFinite(Number(r.unit_price)) ||
        Number(r.unit_price) < 0 ||
        (code === BUSINESS_USEIT_DERIVATION_CODE &&
          (!Number.isFinite(Number(r.support_percentage ?? r.unit_price)) ||
            Number(r.support_percentage ?? r.unit_price) <= 0 ||
            Number(r.support_percentage ?? r.unit_price) > 100))) {
        invalid.push(code);
      }
    }
  }
  const gaps: BusinessSourceGap[] = [];
  if (missing.length) gaps.push("SOURCE_RULE_MISSING_OR_INACTIVE");
  if (duplicate.length) gaps.push("SOURCE_RULE_DUPLICATE_ACTIVE_CODE");
  if (invalid.length) gaps.push("SOURCE_RULE_INVALID_EURO_VALUE");
  if (cfg.implementation?.type === "Onsite" &&
    ((cfg.implementation.onsiteClientDays || 0) > 0 ||
     (cfg.implementation.onsiteBackofficeDays || 0) > 0)) {
    gaps.push("SOURCE_ONSITE_RATE_NEEDS_VERSION");
  }
  if ((cfg.implementation?.customServices || []).some(s => Number(s.price) > 0)) {
    gaps.push("SOURCE_CUSTOM_PRICE_NEEDS_APPROVAL");
  }
  // Current TEST pricing_rules.updated_at is mutable, not a historic signed
  // catalog-revision identity. A complete source shape is not a frozen offer.
  gaps.push("SOURCE_CATALOG_NEEDS_IMMUTABLE_REVISION");
  return Object.freeze({
    requiredCodes: Object.freeze(requiredCodes),
    missing: Object.freeze(missing),
    duplicate: Object.freeze(duplicate),
    invalid: Object.freeze(invalid),
    gaps: Object.freeze(gaps),
    shapeCompatible: gaps.every(g => g === "SOURCE_CATALOG_NEEDS_IMMUTABLE_REVISION"),
    commerciallyFrozen: false as const,
  });
}
